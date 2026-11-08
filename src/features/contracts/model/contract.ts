import { z } from "zod"

import {
  contractSummarySchema,
  contractTypeSchema,
  type ContractType,
} from "@/entities/contract"
import { positionSchema } from "@/entities/personnel"
import { serviceLineSchema } from "@/entities/tenant"
import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { kurusSchema } from "@/shared/lib/money"

/**
 * Vardiya kapsamı: planlı iş günlerini belirler.
 * - `weekdays`: Pazartesi–Cuma, resmi tatil hariç
 * - `six_days`: Pazartesi–Cumartesi, resmi tatil hariç
 * - `all_days`: 7/24 (her gün, tatil dahil)
 */
export const COVERAGES = ["weekdays", "six_days", "all_days"] as const
export const coverageSchema = z.enum(COVERAGES)
export type Coverage = z.infer<typeof coverageSchema>
export const COVERAGE_LABELS: Record<Coverage, string> = {
  weekdays: "Hafta içi (Pzt–Cum)",
  six_days: "6 gün (Pzt–Cmt)",
  all_days: "7/24 (her gün)",
}

export const PRICE_ADJUSTMENT_KINDS = [
  "none",
  "min_wage",
  "fixed_rate",
] as const
export const priceAdjustmentKindSchema = z.enum(PRICE_ADJUSTMENT_KINDS)
export type PriceAdjustmentKind = z.infer<typeof priceAdjustmentKindSchema>
export const PRICE_ADJUSTMENT_LABELS: Record<PriceAdjustmentKind, string> = {
  none: "Fiyat farkı yok",
  min_wage: "Asgari ücret artışı (KİK md. 83 işçilik fiyat farkı)",
  fixed_rate: "Sabit oranlı artış (endeks / zam oranı)",
}

export const PENALTY_KINDS = ["fixed", "percent"] as const
export const penaltyKindSchema = z.enum(PENALTY_KINDS)
export type PenaltyKind = z.infer<typeof penaltyKindSchema>

export const penaltyRuleSchema = z.object({
  code: z.string().trim().min(1, "Kod girin").max(12),
  label: z.string().trim().min(2, "Açıklama girin").max(120),
  kind: penaltyKindSchema,
  /** `fixed`: kuruş / adet, `percent`: işçilik tutarının yüzdesi × 100 (binde değil) */
  amount: z.number().min(0, "Negatif olamaz"),
})
export type PenaltyRule = z.infer<typeof penaltyRuleSchema>

/**
 * Hakediş kuralları. Varsayılanlar kiracının sözleşme şablonundan kopyalanır; gerçek
 * formüller netleştiğinde (plan §7 madde 3) yalnızca şablon değerleri değişir.
 */
export const contractRulesSchema = z.object({
  /** Eksik kişi-gün kesintisi: günlük birim fiyatın yüzdesi (100 = eksik gün ödenmez) */
  shortfallDeductionPercent: z
    .number({ error: "Oran girin" })
    .min(0, "0–200 arası olmalı")
    .max(200, "0–200 arası olmalı"),
  /** Eksik kişi-gün başına ek ceza (kuruş, 0 = yok) */
  shortfallPenaltyPerPersonDay: kurusSchema,
  vatRate: z
    .number({ error: "KDV oranı girin" })
    .min(0, "0–30 arası olmalı")
    .max(30, "0–30 arası olmalı"),
  priceAdjustment: z.object({
    kind: priceAdjustmentKindSchema,
    /** İşçilik kaleminin fiyat farkına esas payı (%) */
    laborSharePercent: z.number().min(0).max(100),
    /** `fixed_rate` için artış oranı (%) */
    ratePercent: z.number().min(0).max(200).nullable(),
    /** `fixed_rate` için yürürlük tarihi; `min_wage` için baz tarih (boşsa sözleşme başlangıcı) */
    effectiveFrom: isoDateSchema.nullable(),
  }),
  penalties: z.array(penaltyRuleSchema).max(20),
})
export type ContractRules = z.infer<typeof contractRulesSchema>

export const contractLocationSchema = z.object({
  locationId: z.string().min(1),
  locationName: z.string(),
  orgUnitName: z.string(),
  /** Lokasyonun sözleşme kapsamına girdiği / çıktığı tarih (dahil) */
  from: isoDateSchema,
  to: isoDateSchema.nullable(),
})
export type ContractLocation = z.infer<typeof contractLocationSchema>

export const commitmentSchema = z.object({
  locationId: z.string().min(1),
  position: positionSchema,
  headcount: z
    .number({ error: "Taahhüt kadroyu girin" })
    .int("Tam sayı olmalı")
    .min(1, "Taahhüt kadro en az 1 kişi olmalı")
    .max(2000, "En fazla 2.000 kişi"),
  coverage: coverageSchema,
})
export type Commitment = z.infer<typeof commitmentSchema>

export const unitPriceSchema = z.object({
  position: positionSchema,
  /** Kişi başı aylık birim fiyat */
  monthly: kurusSchema.refine((value) => value > 0, "Birim fiyat girin"),
})
export type UnitPrice = z.infer<typeof unitPriceSchema>

export const pricesSchema = z.object({
  unitPrices: z.array(unitPriceSchema),
  overtimeHourly: kurusSchema,
  materialMonthly: kurusSchema,
})
export type Prices = z.infer<typeof pricesSchema>

export const scopeItemSchema = z.object({
  serviceLine: serviceLineSchema,
  description: z.string().trim().min(2, "Kalem açıklaması girin").max(200),
})
export type ScopeItem = z.infer<typeof scopeItemSchema>

/** Sürüm gövdesi: sihirbaz ve zeyilname formu aynı şemayı kullanır. */
export const versionBodySchema = z.object({
  serviceLines: z
    .array(serviceLineSchema)
    .min(1, "En az bir hizmet hattı seçin"),
  scopeItems: z.array(scopeItemSchema).max(50),
  locations: z.array(contractLocationSchema).min(1, "En az bir lokasyon seçin"),
  commitments: z.array(commitmentSchema).min(1, "Taahhüt kadro girin"),
  prices: pricesSchema,
  rules: contractRulesSchema,
})
export type VersionBody = z.infer<typeof versionBodySchema>

export const contractVersionSchema = versionBodySchema.extend({
  id: z.string(),
  /** 0: asıl sözleşme, 1..n: zeyilname */
  number: z.number().int().min(0),
  effectiveFrom: isoDateSchema,
  /** Sonraki sürümün başlangıcından bir gün önce; son sürümde sözleşme bitişi */
  effectiveTo: isoDateSchema,
  note: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string(),
})
export type ContractVersion = z.infer<typeof contractVersionSchema>

export const contractSchema = contractSummarySchema.extend({
  ikn: z.string().nullable(),
  templateId: z.string().nullable(),
  versions: z.array(contractVersionSchema).min(1),
})
export type Contract = z.infer<typeof contractSchema>

/** Son sürüm (şema en az bir sürüm garanti eder) */
export function latestVersion<T>(versions: readonly T[]): T {
  const last = versions.at(-1)
  if (last === undefined) throw new Error("Sözleşmenin sürümü yok")
  return last
}

/** Kamu ihale kayıt numarası: "2026/123456" */
export const IKN_PATTERN = /^\d{4}\/\d{1,8}$/

export const contractGeneralSchema = z
  .object({
    title: z.string().trim().min(3, "Sözleşme adını girin").max(160),
    customerId: z.string({ error: "Müşteri seçin" }).min(1, "Müşteri seçin"),
    contractorLegalEntityId: z
      .string({ error: "Yüklenici tüzel kişiliği seçin" })
      .min(1, "Yüklenici tüzel kişiliği seçin"),
    type: contractTypeSchema,
    ikn: z.string().trim().max(20),
    startDate: isoDateSchema.or(z.literal("")),
    endDate: isoDateSchema.or(z.literal("")),
    templateId: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    const ikn = validateIkn(value.type, value.ikn)
    if (ikn) ctx.addIssue({ code: "custom", path: ["ikn"], message: ikn })
    if (!value.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Başlangıç tarihini girin",
      })
    if (!value.endDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Bitiş tarihini girin",
      })
    if (value.startDate && value.endDate && value.endDate < value.startDate)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Bitiş başlangıçtan önce olamaz",
      })
  })
export type ContractGeneral = z.infer<typeof contractGeneralSchema>

/** Kamu ihalesinde İKN zorunlu ve biçimli; diğer tiplerde boş olabilir. */
export function validateIkn(type: ContractType, ikn: string): string | null {
  const value = ikn.trim()
  if (type === "public_tender" && value === "")
    return "Kamu ihalesinde İKN zorunludur"
  if (value !== "" && !IKN_PATTERN.test(value)) return "İKN biçimi: 2026/123456"
  return null
}

export const contractCreateSchema = z.object({
  general: contractGeneralSchema,
  body: versionBodySchema,
})
export type ContractCreateInput = z.infer<typeof contractCreateSchema>

export const addendumInputSchema = z.object({
  effectiveFrom: isoDateSchema,
  note: z.string().trim().min(3, "Zeyilname açıklaması girin").max(500),
  body: versionBodySchema,
})
export type AddendumInput = z.infer<typeof addendumInputSchema>

/* ─────────────────────────── Sözleşme şablonları ─────────────────────────── */

export const contractTemplateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(3, "Şablon adını girin").max(80),
  description: z.string().trim().max(300),
  contractType: contractTypeSchema,
  /** Hazır şablon (Puantio kütüphanesi); silinemez, çoğaltılıp düzenlenir */
  builtIn: z.boolean(),
  rules: contractRulesSchema,
  updatedAt: isoDateTimeSchema,
})
export type ContractTemplate = z.infer<typeof contractTemplateSchema>
export const contractTemplateListSchema = z.object({
  items: z.array(contractTemplateSchema),
})
export const contractTemplateInputSchema = contractTemplateSchema.pick({
  name: true,
  description: true,
  contractType: true,
  rules: true,
})
export type ContractTemplateInput = z.infer<typeof contractTemplateInputSchema>

/* ───────────────────────────── Kadro raporu ───────────────────────────── */

export const MONTH_PATTERN = /^\d{4}-\d{2}$/
export const monthSchema = z.string().regex(MONTH_PATTERN)

const headcountFigureSchema = z.object({
  committed: z.number().min(0),
  /** Fiili kadro (1 ondalık) */
  actual: z.number().min(0),
})

export const headcountRowSchema = headcountFigureSchema.extend({
  contractId: z.string(),
  contractCode: z.string(),
  contractTitle: z.string(),
  customerName: z.string(),
  locationId: z.string(),
  locationName: z.string(),
  orgUnitId: z.string(),
  orgUnitName: z.string(),
  plannedDays: z.number().int().min(0),
  committedPersonDays: z.number().min(0),
  workedPersonDays: z.number().min(0),
  positions: z.array(
    headcountFigureSchema.extend({ position: positionSchema })
  ),
})
export type HeadcountRow = z.infer<typeof headcountRowSchema>

export const headcountReportSchema = z.object({
  month: monthSchema,
  totals: headcountFigureSchema,
  regions: z.array(
    headcountFigureSchema.extend({
      orgUnitId: z.string(),
      orgUnitName: z.string(),
    })
  ),
  rows: z.array(headcountRowSchema),
})
export type HeadcountReport = z.infer<typeof headcountReportSchema>

export const headcountParamsSchema = z.object({
  ay: monthSchema.optional().catch(undefined),
  sozlesme: z.string().min(1).optional().catch(undefined),
  bolge: z.string().min(1).optional().catch(undefined),
})
export type HeadcountParams = z.infer<typeof headcountParamsSchema>

export const headcountLocationDetailSchema = z.object({
  month: monthSchema,
  contractId: z.string(),
  contractTitle: z.string(),
  locationId: z.string(),
  locationName: z.string(),
  plannedDates: z.array(isoDateSchema),
  committed: z.number(),
  actual: z.number(),
  personnel: z.array(
    z.object({
      personnelId: z.string(),
      name: z.string(),
      position: positionSchema,
      workedDays: z.number(),
      /** Planlı iş gününde çalışılmayan günler ve o günün puantaj kodu */
      missing: z.array(
        z.object({ date: isoDateSchema, code: z.string().nullable() })
      ),
    })
  ),
})
export type HeadcountLocationDetail = z.infer<
  typeof headcountLocationDetailSchema
>
