import { z } from "zod"

import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { listParamsSchema, paginatedSchema } from "@/shared/types"

/**
 * Sağlık gözetimi (KVKK özel nitelikli veri). Tanı ve serbest metin tutulmaz; yalnızca
 * muayene tarihi, sonuç ve aşı tarihleri. Liste maskeli döner; detay gerekçeyle açılır.
 */
export const HEALTH_RESULTS = ["fit", "conditional", "unfit"] as const
export const healthResultSchema = z.enum(HEALTH_RESULTS)
export type HealthResult = z.infer<typeof healthResultSchema>
export const HEALTH_RESULT_LABELS: Record<HealthResult, string> = {
  fit: "Uygun",
  conditional: "Şartlı uygun",
  unfit: "Uygun değil",
}

export const HEALTH_DUE_STATES = ["overdue", "d30", "ok", "none"] as const
export const healthDueSchema = z.enum(HEALTH_DUE_STATES)
export type HealthDue = z.infer<typeof healthDueSchema>
export const HEALTH_DUE_LABELS: Record<HealthDue, string> = {
  overdue: "Muayene gecikmiş",
  d30: "30 gün içinde",
  ok: "Zamanında",
  none: "Kayıt yok",
}

/** Maskeli liste satırı: sonuç ve tarih yok, yalnızca muayene ayı ve vade durumu */
export const healthListRowSchema = z.object({
  personnelId: z.string(),
  name: z.string(),
  employeeNumber: z.string(),
  locationName: z.string().nullable(),
  orgUnitName: z.string().nullable(),
  nextExamMonth: z.string().nullable(),
  due: healthDueSchema,
})
export type HealthListRow = z.infer<typeof healthListRowSchema>
export const healthListSchema = paginatedSchema(healthListRowSchema)
export const healthListParamsSchema = listParamsSchema.extend({
  due: healthDueSchema.optional().catch(undefined),
  orgUnitId: z.string().min(1).optional().catch(undefined),
})
export type HealthListParams = z.infer<typeof healthListParamsSchema>

export const vaccinationSchema = z.object({
  type: z.string().trim().min(2, "Aşı adını girin").max(40),
  date: isoDateSchema,
  nextDoseAt: isoDateSchema.nullable(),
})
export type Vaccination = z.infer<typeof vaccinationSchema>

export const healthRecordSchema = z.object({
  personnelId: z.string(),
  examinedAt: isoDateSchema,
  nextExamAt: isoDateSchema,
  result: healthResultSchema,
  vaccinations: z.array(vaccinationSchema),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string(),
})
export type HealthRecord = z.infer<typeof healthRecordSchema>

export const revealResponseSchema = z.object({
  personnelId: z.string(),
  record: healthRecordSchema.nullable(),
})
export type RevealResponse = z.infer<typeof revealResponseSchema>

export const REVEAL_REASON_MIN = 10
export const revealInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(
      REVEAL_REASON_MIN,
      `Gerekçe en az ${REVEAL_REASON_MIN} karakter olmalı`
    )
    .max(300),
})
export type RevealInput = z.infer<typeof revealInputSchema>

export const healthRecordInputSchema = z.object({
  examinedAt: isoDateSchema,
  result: healthResultSchema,
  vaccinations: z.array(vaccinationSchema).max(20),
})
export type HealthRecordInput = z.infer<typeof healthRecordInputSchema>

export const accessLogRowSchema = z.object({
  id: z.string(),
  occurredAt: isoDateTimeSchema,
  actorName: z.string(),
  personnelId: z.string(),
  personnelName: z.string(),
  action: z.enum(["reveal", "update"]),
  reason: z.string(),
})
export type AccessLogRow = z.infer<typeof accessLogRowSchema>
export const accessLogListSchema = paginatedSchema(accessLogRowSchema)
export const ACCESS_ACTION_LABELS: Record<AccessLogRow["action"], string> = {
  reveal: "Görüntüleme",
  update: "Güncelleme",
}
