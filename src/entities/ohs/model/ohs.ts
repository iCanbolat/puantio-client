import { z } from "zod"

import { certificateTypeSchema } from "@/entities/location"
import { isoDateSchema } from "@/shared/lib/date"

/**
 * Modüller arası ortak İSG modelleri (Faz 6). Vardiya panosu, İSG sayfaları, müşteri
 * denetim paketi ve mock sunucu aynı uygunluk kurallarını kullanır.
 */

/** Bir gereksinimin belirli bir gündeki durumu */
export const COMPLIANCE_STATES = [
  "valid",
  "expiring",
  "expired",
  "missing",
] as const
export const complianceStateSchema = z.enum(COMPLIANCE_STATES)
export type ComplianceState = z.infer<typeof complianceStateSchema>
export const COMPLIANCE_LABELS: Record<ComplianceState, string> = {
  valid: "Geçerli",
  expiring: "Yakında doluyor",
  expired: "Süresi dolmuş",
  missing: "Eksik",
}

/** Uyarı kovaları: süresi dolmuş, 0–30, 31–60, 61–90 gün */
export const EXPIRY_BUCKETS = ["expired", "d30", "d60", "d90"] as const
export const expiryBucketSchema = z.enum(EXPIRY_BUCKETS)
export type ExpiryBucket = z.infer<typeof expiryBucketSchema>
export const EXPIRY_BUCKET_LABELS: Record<ExpiryBucket, string> = {
  expired: "Süresi dolmuş",
  d30: "30 gün içinde",
  d60: "31–60 gün",
  d90: "61–90 gün",
}

export const personCertificateSchema = z.object({
  type: certificateTypeSchema,
  /** `null` = süresiz */
  expiresAt: isoDateSchema.nullable(),
})
export type PersonCertificate = z.infer<typeof personCertificateSchema>

/** Vardiya panosu yanıtındaki uygunluk girdisi (lokasyon gereksinimi + kadro sertifikaları) */
export const scheduleComplianceSchema = z.object({
  requiredCertificates: z.array(certificateTypeSchema),
  personnel: z.array(
    z.object({
      personnelId: z.string(),
      certificates: z.array(personCertificateSchema),
    })
  ),
})
export type ScheduleCompliance = z.infer<typeof scheduleComplianceSchema>

/** Eğitim yenileme kuralı: tehlike sınıfına göre, sabit ay veya yenilemesiz */
export const trainingRenewalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hazard_class") }),
  z.object({
    kind: z.literal("months"),
    months: z
      .number({ error: "Ay girin" })
      .int("Tam sayı girin")
      .min(1, "En az 1 ay")
      .max(120, "En fazla 120 ay"),
  }),
  z.object({ kind: z.literal("none") }),
])
export type TrainingRenewal = z.infer<typeof trainingRenewalSchema>

export const trainingTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(3, "Eğitim adı en az 3 karakter").max(80),
  renewal: trainingRenewalSchema,
  /** Yalnızca bu sertifika gereksinimi olan lokasyonlarda zorunlu; boşsa herkese */
  requiredFor: z.array(certificateTypeSchema),
  isActive: z.boolean(),
})
export type TrainingType = z.infer<typeof trainingTypeSchema>

export const TRAINING_STATES = [
  "valid",
  "expiring",
  "overdue",
  "never",
] as const
export const trainingStateSchema = z.enum(TRAINING_STATES)
export type TrainingState = z.infer<typeof trainingStateSchema>
export const TRAINING_STATE_LABELS: Record<TrainingState, string> = {
  valid: "Geçerli",
  expiring: "30 gün içinde",
  overdue: "Gecikmiş",
  never: "Hiç almamış",
}
