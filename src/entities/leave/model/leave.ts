import { z } from "zod"

import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { brandedId, listParamsSchema, paginatedSchema } from "@/shared/types"

/**
 * İzin, rapor ve devamsızlık kayıtları. KVKK: sağlık raporunda yalnızca tarih aralığı tutulur;
 * tanı, hastane veya açıklama alanı yoktur.
 */
export const leaveIdSchema = brandedId("LeaveId")
export type LeaveId = z.infer<typeof leaveIdSchema>

export const LEAVE_TYPES = [
  "annual",
  "excuse",
  "unpaid",
  "maternity",
  "administrative",
  "sick_report",
] as const
export const leaveTypeSchema = z.enum(LEAVE_TYPES)
export type LeaveType = z.infer<typeof leaveTypeSchema>
export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: "Yıllık izin",
  excuse: "Mazeret izni",
  unpaid: "Ücretsiz izin",
  maternity: "Doğum izni",
  administrative: "İdari izin",
  sick_report: "Sağlık raporu",
}

export const LEAVE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const
export const leaveStatusSchema = z.enum(LEAVE_STATUSES)
export type LeaveStatus = z.infer<typeof leaveStatusSchema>
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
}

export const leaveSchema = z.object({
  id: leaveIdSchema,
  personnelId: z.string(),
  personnelName: z.string(),
  employeeNumber: z.string(),
  locationName: z.string().nullable(),
  type: leaveTypeSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  /** İş günü sayısı (pazar ve resmi tatiller hariç) */
  days: z.number().min(0),
  status: leaveStatusSchema,
  /** Sağlık raporunda her zaman `null` */
  note: z.string().nullable(),
  requestedAt: isoDateTimeSchema,
  requestedBy: z.string(),
  decidedAt: isoDateTimeSchema.nullable(),
  decidedBy: z.string().nullable(),
  decisionNote: z.string().nullable(),
})
export type Leave = z.infer<typeof leaveSchema>
export const leaveListSchema = paginatedSchema(leaveSchema)

export const leaveListParamsSchema = listParamsSchema.extend({
  status: leaveStatusSchema.optional().catch(undefined),
  type: leaveTypeSchema.optional().catch(undefined),
  orgUnitId: z.string().min(1).optional().catch(undefined),
  personnelId: z.string().min(1).optional().catch(undefined),
  /** Takvim görünümü: bu ayla kesişen izinler ("2026-09") */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
})
export type LeaveListParams = z.infer<typeof leaveListParamsSchema>

export const leaveInputSchema = z
  .object({
    personnelId: z.string({ error: "Personel seçin" }).min(1, "Personel seçin"),
    type: leaveTypeSchema,
    startDate: isoDateSchema
      .or(z.literal(""))
      .refine((value) => value !== "", "Başlangıç tarihini seçin"),
    endDate: isoDateSchema
      .or(z.literal(""))
      .refine((value) => value !== "", "Bitiş tarihini seçin"),
    note: z.string().trim().max(300, "En fazla 300 karakter").optional(),
  })
  .refine(
    (value) =>
      !value.startDate || !value.endDate || value.startDate <= value.endDate,
    {
      message: "Bitiş tarihi başlangıçtan önce olamaz",
      path: ["endDate"],
    }
  )
  .transform((value) => ({
    ...value,
    // KVKK: sağlık raporunda açıklama tutulmaz
    note: value.type === "sick_report" ? undefined : value.note || undefined,
  }))
export type LeaveInput = z.input<typeof leaveInputSchema>
export type LeavePayload = z.output<typeof leaveInputSchema>

export const leaveDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).optional(),
})
export type LeaveDecision = z.infer<typeof leaveDecisionSchema>

export const leaveDecisionResultSchema = z.object({
  leave: leaveSchema,
  /** Onayda kaldırılan (izinle çakışan) vardiya sayısı */
  removedShifts: z.number().int().min(0),
})

export const leaveBalanceSchema = z.object({
  personnelId: z.string(),
  year: z.number().int(),
  /** Kıdeme göre hak edilen yıllık izin (gün) */
  entitlement: z.number().min(0),
  used: z.number().min(0),
  pending: z.number().min(0),
  remaining: z.number(),
  seniorityYears: z.number().int().min(0),
})
export type LeaveBalance = z.infer<typeof leaveBalanceSchema>

/**
 * 4857 sayılı İş Kanunu md. 53: 1–5 yıl 14 gün, 5–15 yıl 20 gün, 15 yıl ve üzeri 26 gün.
 * 1 yılı doldurmamış personel yıllık izne hak kazanmaz.
 */
export function annualLeaveEntitlement(seniorityYears: number): number {
  if (seniorityYears < 1) return 0
  if (seniorityYears < 5) return 14
  if (seniorityYears < 15) return 20
  return 26
}

/** Tam yıl kıdem */
export function seniorityYears(hireDate: string, onDate: string): number {
  const [hy, hm, hd] = hireDate.split("-").map(Number)
  const [y, m, d] = onDate.split("-").map(Number)
  if (!hy || !hm || !hd || !y || !m || !d) return 0
  let years = y - hy
  if (m < hm || (m === hm && d < hd)) years -= 1
  return Math.max(0, years)
}
