import { z } from "zod"

import { contractTypeSchema } from "@/entities/contract"
import { positionSchema } from "@/entities/personnel"
import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { kurusSchema } from "@/shared/lib/money"
import { brandedId, listParamsSchema, paginatedSchema } from "@/shared/types"

export const progressPaymentIdSchema = brandedId("ProgressPaymentId")
export type ProgressPaymentId = z.infer<typeof progressPaymentIdSchema>

/**
 * Hakediş akışı: Taslak → Kontrol → Müşteri onayı → Onaylandı → Faturalandı.
 * Müşteri onayından sonra kilitlenir (yeniden hesaplama ve düzenleme 409).
 */
export const PROGRESS_PAYMENT_STATUSES = [
  "draft",
  "review",
  "customer_approval",
  "approved",
  "invoiced",
] as const
export const progressPaymentStatusSchema = z.enum(PROGRESS_PAYMENT_STATUSES)
export type ProgressPaymentStatus = z.infer<typeof progressPaymentStatusSchema>
export const PROGRESS_PAYMENT_STATUS_LABELS: Record<
  ProgressPaymentStatus,
  string
> = {
  draft: "Taslak",
  review: "Kontrolde",
  customer_approval: "Müşteri onayında",
  approved: "Onaylandı",
  invoiced: "Faturalandı",
}
export const PROGRESS_PAYMENT_STATUS_TONES = {
  draft: "neutral",
  review: "info",
  customer_approval: "warning",
  approved: "success",
  invoiced: "success",
} as const satisfies Record<ProgressPaymentStatus, string>

export const PROGRESS_PAYMENT_ACTIONS = [
  "submit",
  "send_to_customer",
  "approve_customer",
  "invoice",
  "return_to_draft",
] as const
export const progressPaymentActionSchema = z.enum(PROGRESS_PAYMENT_ACTIONS)
export type ProgressPaymentAction = z.infer<typeof progressPaymentActionSchema>
export const PROGRESS_PAYMENT_ACTION_LABELS: Record<
  ProgressPaymentAction,
  string
> = {
  submit: "Kontrole gönder",
  send_to_customer: "Kontrol onayı ver, müşteriye gönder",
  approve_customer: "Müşteri adına onayla",
  invoice: "Faturalandı olarak işaretle",
  return_to_draft: "Taslağa geri al",
}

export const LINE_KINDS = [
  "labor",
  "shortfall",
  "shortfall_penalty",
  "overtime",
  "material",
  "price_adjustment",
  "penalty",
] as const
export const lineKindSchema = z.enum(LINE_KINDS)
export type LineKind = z.infer<typeof lineKindSchema>
export const LINE_KIND_LABELS: Record<LineKind, string> = {
  labor: "İşçilik (taahhüt)",
  shortfall: "Eksik personel kesintisi",
  shortfall_penalty: "Eksik personel cezası",
  overtime: "Fazla mesai",
  material: "Malzeme bedeli",
  price_adjustment: "Fiyat farkı",
  penalty: "Ceza",
}

export const LINE_UNITS = [
  "kişi-ay",
  "kişi-gün",
  "saat",
  "ay",
  "adet",
  "%",
] as const

export const progressPaymentLineSchema = z.object({
  /** Fark tablosunda eşleştirme anahtarı */
  key: z.string(),
  kind: lineKindSchema,
  label: z.string(),
  locationId: z.string().nullable(),
  locationName: z.string().nullable(),
  position: positionSchema.nullable(),
  versionNumber: z.number().int().nullable(),
  from: isoDateSchema.nullable(),
  to: isoDateSchema.nullable(),
  quantity: z.number(),
  unit: z.enum(LINE_UNITS),
  unitPrice: kurusSchema.nullable(),
  /** Kesinti ve cezalar negatiftir */
  amount: kurusSchema,
})
export type ProgressPaymentLine = z.infer<typeof progressPaymentLineSchema>

export const progressPaymentTotalsSchema = z.object({
  labor: kurusSchema,
  deductions: kurusSchema,
  overtime: kurusSchema,
  material: kurusSchema,
  priceAdjustment: kurusSchema,
  penalties: kurusSchema,
  subtotal: kurusSchema,
  vatRate: z.number(),
  vat: kurusSchema,
  total: kurusSchema,
})
export type ProgressPaymentTotals = z.infer<typeof progressPaymentTotalsSchema>

export const progressPaymentStatsSchema = z.object({
  committedPersonDays: z.number(),
  workedPersonDays: z.number(),
  shortfallPersonDays: z.number(),
  /** Taahhüt üstü çalışılan kişi-gün (ödenmez) */
  excessPersonDays: z.number(),
  overtimeHours: z.number(),
})
export type ProgressPaymentStats = z.infer<typeof progressPaymentStatsSchema>

export const calculationSchema = z.object({
  lines: z.array(progressPaymentLineSchema),
  totals: progressPaymentTotalsSchema,
  stats: progressPaymentStatsSchema,
})
export type Calculation = z.infer<typeof calculationSchema>

export const manualPenaltySchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["fixed", "percent"]),
  /** fixed: kuruş/adet; percent: yüzde */
  amount: z.number().min(0),
  quantity: z.number().int().min(1).max(999),
  note: z.string().trim().max(200).nullable(),
})
export type ManualPenalty = z.infer<typeof manualPenaltySchema>

const summaryFields = {
  id: progressPaymentIdSchema,
  number: z.string(),
  contractId: z.string(),
  contractCode: z.string(),
  contractTitle: z.string(),
  contractType: contractTypeSchema,
  customerName: z.string(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  status: progressPaymentStatusSchema,
  total: kurusSchema,
  /** Taslaktan sonra puantaj değişti (yeniden hesaplanmalı) */
  isStale: z.boolean(),
  updatedAt: isoDateTimeSchema,
}

export const progressPaymentSummarySchema = z.object(summaryFields)
export type ProgressPaymentSummary = z.infer<
  typeof progressPaymentSummarySchema
>
export const progressPaymentListSchema = paginatedSchema(
  progressPaymentSummarySchema
)

export const progressPaymentSchema = z.object({
  ...summaryFields,
  calculation: calculationSchema,
  penalties: z.array(manualPenaltySchema),
  /** Kaynak puantaj dönemi onaylı mı (İK onaylı veya kilitli) */
  timesheetApproved: z.boolean(),
  invoiceNumber: z.string().nullable(),
  calculatedAt: isoDateTimeSchema,
  history: z.array(
    z.object({
      at: isoDateTimeSchema,
      actor: z.string(),
      action: z.string(),
      note: z.string().nullable(),
    })
  ),
  availableActions: z.array(progressPaymentActionSchema),
})
export type ProgressPayment = z.infer<typeof progressPaymentSchema>

export const progressPaymentListParamsSchema = listParamsSchema.extend({
  status: progressPaymentStatusSchema.optional().catch(undefined),
  contractId: z.string().min(1).optional().catch(undefined),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
})
export type ProgressPaymentListParams = z.infer<
  typeof progressPaymentListParamsSchema
>

export const createProgressPaymentSchema = z.object({
  contractId: z.string({ error: "Sözleşme seçin" }).min(1, "Sözleşme seçin"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Dönem seçin"),
})
export type CreateProgressPaymentInput = z.infer<
  typeof createProgressPaymentSchema
>

export const transitionInputSchema = z.object({
  action: progressPaymentActionSchema,
  note: z.string().trim().max(300).nullable().optional(),
  invoiceNumber: z.string().trim().max(30).nullable().optional(),
})
export type TransitionInput = z.infer<typeof transitionInputSchema>

/** Taslak ile güncel puantaj arasındaki fark (yeniden hesaplama önizlemesi) */
export const recalculationPreviewSchema = z.object({
  current: calculationSchema,
  next: calculationSchema,
  changes: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      before: kurusSchema.nullable(),
      after: kurusSchema.nullable(),
      difference: kurusSchema,
    })
  ),
})
export type RecalculationPreview = z.infer<typeof recalculationPreviewSchema>

export const minWageSchema = z.object({
  items: z.array(
    z.object({ effectiveFrom: isoDateSchema, grossMonthly: kurusSchema })
  ),
})
