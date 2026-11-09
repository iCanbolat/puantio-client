import { z } from "zod"

import { customerSectorSchema } from "@/entities/customer"
import { serviceLineSchema } from "@/entities/tenant"
import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { brandedId, listParamsSchema, paginatedSchema } from "@/shared/types"

export const auditTemplateIdSchema = brandedId("AuditTemplateId")
export type AuditTemplateId = z.infer<typeof auditTemplateIdSchema>
export const auditIdSchema = brandedId("AuditId")
export type AuditId = z.infer<typeof auditIdSchema>

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
export const monthSchema = z.string().regex(MONTH_PATTERN)

/** Madde tipleri: evet/hayır, 1–5 puan, fotoğraf zorunlu (evet/hayır + fotoğraf), not (puansız) */
export const AUDIT_ITEM_TYPES = [
  "yes_no",
  "score_1_5",
  "photo_required",
  "note",
] as const
export const auditItemTypeSchema = z.enum(AUDIT_ITEM_TYPES)
export type AuditItemType = z.infer<typeof auditItemTypeSchema>
export const AUDIT_ITEM_TYPE_LABELS: Record<AuditItemType, string> = {
  yes_no: "Evet / hayır",
  score_1_5: "1–5 puan",
  photo_required: "Fotoğraf zorunlu",
  note: "Not (puansız)",
}

export const WORK_ORDER_PRIORITY_VALUES = [
  "urgent",
  "high",
  "normal",
  "low",
] as const

export const auditItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(3, "Madde metni en az 3 karakter").max(200),
  type: auditItemTypeSchema,
  /** Puanlı maddelerde ağırlık; tüm puanlı maddelerin toplamı 100 olmalı */
  weight: z
    .number({ error: "Ağırlığı girin" })
    .int("Tam sayı olmalı")
    .min(0, "Negatif olamaz")
    .max(100, "En fazla 100"),
  /** Başarısızsa otomatik iş emri açılır */
  critical: z.boolean(),
  workOrderPriority: z.enum(WORK_ORDER_PRIORITY_VALUES),
})
export type AuditItem = z.infer<typeof auditItemSchema>

export const auditSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(2, "Bölüm adını girin").max(80),
  items: z.array(auditItemSchema).min(1, "Bölümde en az bir madde olmalı"),
})
export type AuditSection = z.infer<typeof auditSectionSchema>

export const auditTemplateBodySchema = z.object({
  name: z.string().trim().min(3, "Şablon adı en az 3 karakter").max(80),
  description: z.string().trim().max(300).nullable(),
  serviceLine: serviceLineSchema,
  /** Boşsa tüm müşteri sektörlerinde kullanılır */
  sectors: z.array(customerSectorSchema),
  sections: z.array(auditSectionSchema).min(1, "En az bir bölüm ekleyin"),
})
export type AuditTemplateBody = z.infer<typeof auditTemplateBodySchema>

export const auditTemplateVersionSchema = z.object({
  number: z.number().int().min(1),
  publishedAt: isoDateTimeSchema,
  publishedBy: z.string(),
  itemCount: z.number().int(),
})

export const auditTemplateSchema = auditTemplateBodySchema.extend({
  id: auditTemplateIdSchema,
  /** Platform kütüphanesinden gelen hazır şablon: değiştirilemez, çoğaltılır */
  builtIn: z.boolean(),
  version: z.number().int().min(1),
  versions: z.array(auditTemplateVersionSchema),
  isActive: z.boolean(),
  updatedAt: isoDateTimeSchema,
  /** Bu şablonla yapılmış denetim sayısı */
  auditCount: z.number().int().min(0),
})
export type AuditTemplate = z.infer<typeof auditTemplateSchema>
export const auditTemplateListSchema = z.object({
  items: z.array(auditTemplateSchema),
})

/** Bir maddenin cevabı. `passed: null` = uygulanamaz; not maddesinde yalnızca `note` */
export const auditAnswerSchema = z.object({
  itemId: z.string(),
  passed: z.boolean().nullable(),
  score: z.number().int().min(1).max(5).nullable(),
  note: z.string().nullable(),
  photoUrls: z.array(z.string()),
})
export type AuditAnswer = z.infer<typeof auditAnswerSchema>

export const auditSummarySchema = z.object({
  id: auditIdSchema,
  number: z.string(),
  templateId: z.string(),
  templateName: z.string(),
  templateVersion: z.number().int(),
  locationId: z.string(),
  locationCode: z.string(),
  locationName: z.string(),
  orgUnitName: z.string(),
  customerName: z.string(),
  auditorName: z.string(),
  performedAt: isoDateTimeSchema,
  /** 0–100, bir ondalık */
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  criticalFailures: z.number().int().min(0),
  workOrderCount: z.number().int().min(0),
})
export type AuditSummary = z.infer<typeof auditSummarySchema>

export const auditSchema = auditSummarySchema.extend({
  sections: z.array(auditSectionSchema),
  answers: z.array(auditAnswerSchema),
  generalNote: z.string().nullable(),
  workOrders: z.array(
    z.object({
      id: z.string(),
      number: z.string(),
      itemId: z.string(),
      status: z.string(),
    })
  ),
})
export type Audit = z.infer<typeof auditSchema>

export const auditListSchema = paginatedSchema(auditSummarySchema)
export const AUDIT_SORTABLE_FIELDS = ["performedAt", "score"] as const
export const auditListParamsSchema = listParamsSchema.extend({
  locationId: z.string().min(1).optional().catch(undefined),
  templateId: z.string().min(1).optional().catch(undefined),
  orgUnitId: z.string().min(1).optional().catch(undefined),
  result: z.enum(["passed", "failed", "critical"]).optional().catch(undefined),
  month: monthSchema.optional().catch(undefined),
})
export type AuditListParams = z.infer<typeof auditListParamsSchema>

/** Saha uygulamasının gönderdiği denetim (web tarafında yalnızca mock/dev paneli kullanır) */
export const submitAuditSchema = z.object({
  templateId: z.string().min(1),
  locationId: z.string().min(1),
  performedAt: isoDateTimeSchema,
  answers: z.array(
    auditAnswerSchema.omit({ photoUrls: true }).extend({
      photoCount: z.number().int().min(0),
    })
  ),
  generalNote: z.string().nullable(),
})
export type SubmitAuditInput = z.infer<typeof submitAuditSchema>

export const trendPointSchema = z.object({
  month: monthSchema,
  average: z.number().nullable(),
  count: z.number().int(),
})
export const auditTrendSchema = z.object({
  overall: z.array(trendPointSchema),
  groups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      points: z.array(trendPointSchema),
    })
  ),
})
export type AuditTrend = z.infer<typeof auditTrendSchema>
export const auditTrendParamsSchema = z.object({
  groupBy: z.enum(["orgUnit", "location"]).catch("orgUnit"),
  months: z.coerce.number().int().min(3).max(12).catch(6),
  locationId: z.string().min(1).optional().catch(undefined),
})
export type AuditTrendParams = z.infer<typeof auditTrendParamsSchema>

// Denetim planı ---------------------------------------------------------------

export const AUDIT_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const
export const auditFrequencySchema = z.enum(AUDIT_FREQUENCIES)
export type AuditFrequency = z.infer<typeof auditFrequencySchema>
export const AUDIT_FREQUENCY_LABELS: Record<AuditFrequency, string> = {
  weekly: "Haftalık",
  biweekly: "2 haftada bir",
  monthly: "Aylık",
}

export const auditPlanInputSchema = z.object({
  auditorId: z.string().min(1, "Denetçi seçin"),
  locationId: z.string().min(1, "Lokasyon seçin"),
  templateId: z.string().min(1, "Şablon seçin"),
  frequency: auditFrequencySchema,
  startDate: isoDateSchema,
})
export type AuditPlanInput = z.infer<typeof auditPlanInputSchema>

export const PLAN_STATES = ["complete", "on_track", "late"] as const
export type PlanState = (typeof PLAN_STATES)[number]
export const PLAN_STATE_LABELS: Record<PlanState, string> = {
  complete: "Tamamlandı",
  on_track: "Planda",
  late: "Gecikmiş",
}

export const auditPlanRowSchema = auditPlanInputSchema.extend({
  id: z.string(),
  auditorName: z.string(),
  locationName: z.string(),
  locationCode: z.string(),
  templateName: z.string(),
  planned: z.number().int(),
  done: z.number().int(),
  missing: z.number().int(),
  state: z.enum(PLAN_STATES),
  lastAuditAt: isoDateTimeSchema.nullable(),
})
export type AuditPlanRow = z.infer<typeof auditPlanRowSchema>
export const auditPlanSchema = z.object({
  month: monthSchema,
  items: z.array(auditPlanRowSchema),
  totals: z.object({
    planned: z.number().int(),
    done: z.number().int(),
    missing: z.number().int(),
  }),
})
export type AuditPlan = z.infer<typeof auditPlanSchema>
export const auditPlanParamsSchema = z.object({
  ay: monthSchema.optional().catch(undefined),
})

export const auditTemplateInputSchema = auditTemplateBodySchema.extend({
  isActive: z.boolean(),
})
export type AuditTemplateInput = z.infer<typeof auditTemplateInputSchema>

export const auditorOptionsSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), name: z.string(), title: z.string() })
  ),
})
