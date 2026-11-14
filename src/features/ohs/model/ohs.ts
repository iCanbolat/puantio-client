import { z } from "zod"

import { certificateTypeSchema } from "@/entities/location"
import {
  complianceStateSchema,
  expiryBucketSchema,
  trainingStateSchema,
  trainingTypeSchema,
} from "@/entities/ohs"
import { hazardClassSchema, ohsRulesSchema } from "@/entities/tenant"
import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { listParamsSchema, paginatedSchema } from "@/shared/types"

// Ayarlar ----------------------------------------------------------------------

export const documentTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Belge adı girin").max(80),
  required: z.boolean(),
  validityMonths: z
    .number({ error: "Ay girin" })
    .int("Tam sayı girin")
    .min(1, "En az 1 ay")
    .max(120, "En fazla 120 ay")
    .nullable(),
  isActive: z.boolean(),
})
export type DocumentType = z.infer<typeof documentTypeSchema>

export const ohsSettingsSchema = z.object({
  rules: ohsRulesSchema,
  trainingTypes: z.array(trainingTypeSchema),
  documentTypes: z.array(documentTypeSchema),
  certificateValidityMonths: z.record(
    z.string(),
    z.number().int().min(1).max(120).nullable()
  ),
})
export type OhsSettings = z.infer<typeof ohsSettingsSchema>

// Genel bakış ------------------------------------------------------------------

export const bucketCountsSchema = z.object({
  expired: z.number().int(),
  d30: z.number().int(),
  d60: z.number().int(),
  d90: z.number().int(),
})
export type BucketCounts = z.infer<typeof bucketCountsSchema>

export const ohsOverviewSchema = z.object({
  certificateBuckets: bucketCountsSchema,
  /** Zorunlu sertifikası hiç olmayan personel */
  missingCertificates: z.number().int(),
  trainings: z.object({
    overdue: z.number().int(),
    expiring: z.number().int(),
    never: z.number().int(),
  }),
  upcomingSessions: z.array(
    z.object({
      id: z.string(),
      number: z.string(),
      typeName: z.string(),
      date: isoDateSchema,
      participantCount: z.number().int(),
    })
  ),
  /** Yalnızca `health:read` yetkisinde döner */
  health: z
    .object({ overdue: z.number().int(), dueIn30: z.number().int() })
    .nullable(),
})
export type OhsOverview = z.infer<typeof ohsOverviewSchema>

// Eğitimler --------------------------------------------------------------------

export const SESSION_STATUSES = ["planned", "completed", "cancelled"] as const
export const SESSION_STATUS_LABELS: Record<
  (typeof SESSION_STATUSES)[number],
  string
> = {
  planned: "Planlandı",
  completed: "Tamamlandı",
  cancelled: "İptal",
}

export const trainingSessionSchema = z.object({
  id: z.string(),
  number: z.string(),
  typeId: z.string(),
  typeName: z.string(),
  date: isoDateSchema,
  trainer: z.string(),
  locationId: z.string().nullable(),
  locationName: z.string().nullable(),
  durationHours: z.number(),
  status: z.enum(SESSION_STATUSES),
  participants: z.array(
    z.object({
      personnelId: z.string(),
      name: z.string(),
      employeeNumber: z.string(),
      attended: z.boolean().nullable(),
    })
  ),
})
export type TrainingSession = z.infer<typeof trainingSessionSchema>
export const trainingSessionListSchema = z.object({
  items: z.array(trainingSessionSchema),
})

export const trainingSessionInputSchema = z.object({
  typeId: z.string().min(1, "Eğitim türü seçin"),
  date: isoDateSchema,
  trainer: z.string().trim().min(3, "Eğitmen adını girin").max(80),
  locationId: z.string().min(1).nullable(),
  durationHours: z
    .number({ error: "Süre girin" })
    .min(0.5, "En az 0,5 saat")
    .max(16, "En fazla 16 saat"),
  participantIds: z
    .array(z.string().min(1))
    .min(1, "En az bir katılımcı seçin")
    .max(200, "En fazla 200 katılımcı"),
})
export type TrainingSessionInput = z.infer<typeof trainingSessionInputSchema>

export const attendanceInputSchema = z.object({
  attendance: z
    .array(z.object({ personnelId: z.string(), attended: z.boolean() }))
    .min(1),
})
export type AttendanceInput = z.infer<typeof attendanceInputSchema>

export const trainingStatusRowSchema = z.object({
  personnelId: z.string(),
  name: z.string(),
  employeeNumber: z.string(),
  locationName: z.string().nullable(),
  orgUnitName: z.string().nullable(),
  hazardClass: hazardClassSchema,
  typeId: z.string(),
  typeName: z.string(),
  lastCompletedAt: isoDateSchema.nullable(),
  dueAt: isoDateSchema.nullable(),
  state: trainingStateSchema,
})
export type TrainingStatusRow = z.infer<typeof trainingStatusRowSchema>
export const trainingStatusListSchema = paginatedSchema(trainingStatusRowSchema)
export const trainingStatusParamsSchema = listParamsSchema.extend({
  typeId: z.string().min(1).optional().catch(undefined),
  state: trainingStateSchema.optional().catch(undefined),
  orgUnitId: z.string().min(1).optional().catch(undefined),
  locationId: z.string().min(1).optional().catch(undefined),
  sekme: z.enum(["durum", "oturumlar"]).catch("durum"),
})
export type TrainingStatusParams = z.infer<typeof trainingStatusParamsSchema>

/** Eğitim planlamasında katılımcı seçimi (lokasyon veya birim bazında) */
export const trainingCandidatesSchema = z.object({
  items: z.array(
    z.object({
      personnelId: z.string(),
      name: z.string(),
      employeeNumber: z.string(),
      locationName: z.string().nullable(),
      state: trainingStateSchema,
    })
  ),
})
export type TrainingCandidate = z.infer<
  typeof trainingCandidatesSchema
>["items"][number]

// Sertifikalar -----------------------------------------------------------------

export const certificateSchema = z.object({
  id: z.string(),
  personnelId: z.string(),
  personnelName: z.string(),
  employeeNumber: z.string(),
  locationName: z.string().nullable(),
  type: certificateTypeSchema,
  number: z.string(),
  issuedAt: isoDateSchema,
  expiresAt: isoDateSchema.nullable(),
  bucket: expiryBucketSchema.nullable(),
  /** Aynı tipte daha yeni sertifika varsa eski kayıt "yenilendi" sayılır */
  superseded: z.boolean(),
  documentUrl: z.string().nullable(),
})
export type Certificate = z.infer<typeof certificateSchema>
export const certificateListSchema = paginatedSchema(certificateSchema)
export const CERTIFICATE_SORTABLE_FIELDS = [
  "expiresAt",
  "personnelName",
] as const
export const certificateListParamsSchema = listParamsSchema.extend({
  sort: z.enum(CERTIFICATE_SORTABLE_FIELDS).optional().catch(undefined),
  bucket: expiryBucketSchema.optional().catch(undefined),
  type: certificateTypeSchema.optional().catch(undefined),
  orgUnitId: z.string().min(1).optional().catch(undefined),
  personnelId: z.string().min(1).optional().catch(undefined),
})
export type CertificateListParams = z.infer<typeof certificateListParamsSchema>

export const certificateSummarySchema = z.object({
  buckets: bucketCountsSchema,
  missing: z.number().int(),
})

export const certificateInputSchema = z
  .object({
    personnelId: z.string().min(1, "Personel seçin"),
    type: certificateTypeSchema,
    number: z.string().trim().min(2, "Belge no girin").max(40),
    issuedAt: isoDateSchema,
    expiresAt: isoDateSchema.nullable(),
    uploadId: z.string().min(1).nullable(),
  })
  .refine(
    (value) => value.expiresAt === null || value.expiresAt >= value.issuedAt,
    {
      message: "Bitiş tarihi veriliş tarihinden önce olamaz",
      path: ["expiresAt"],
    }
  )
export type CertificateInput = z.infer<typeof certificateInputSchema>

// Personel İSG kartı -----------------------------------------------------------

export const personnelOhsSchema = z.object({
  personnelId: z.string(),
  hazardClass: hazardClassSchema,
  hazardClassSource: z.enum(["location", "tenant"]),
  locationName: z.string().nullable(),
  requirements: z.array(
    z.object({
      type: certificateTypeSchema,
      state: complianceStateSchema,
      expiresAt: isoDateSchema.nullable(),
    })
  ),
  trainings: z.array(
    z.object({
      typeId: z.string(),
      typeName: z.string(),
      lastCompletedAt: isoDateSchema.nullable(),
      dueAt: isoDateSchema.nullable(),
      state: trainingStateSchema,
    })
  ),
  certificates: z.array(certificateSchema),
})
export type PersonnelOhs = z.infer<typeof personnelOhsSchema>

// Denetim paketi ---------------------------------------------------------------

export const auditPackRowSchema = z.object({
  personnelId: z.string(),
  name: z.string(),
  position: z.string(),
  trainings: z.array(
    z.object({
      typeName: z.string(),
      state: trainingStateSchema,
      dueAt: isoDateSchema.nullable(),
    })
  ),
  certificates: z.array(
    z.object({
      type: certificateTypeSchema,
      state: complianceStateSchema,
      expiresAt: isoDateSchema.nullable(),
    })
  ),
  /** Yalnızca kiracı ayarı açıksa ve sonuç "uygun" ise `"fit"`; aksi halde `null` (detay yok) */
  health: z.literal("fit").nullable(),
  compliant: z.boolean(),
})
export type AuditPackRow = z.infer<typeof auditPackRowSchema>

export const auditPackSchema = z.object({
  location: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    customerName: z.string(),
    requiredCertificates: z.array(certificateTypeSchema),
    hazardClass: hazardClassSchema,
  }),
  date: isoDateSchema,
  generatedAt: isoDateTimeSchema,
  includesHealth: z.boolean(),
  rows: z.array(auditPackRowSchema),
  summary: z.object({ total: z.number().int(), compliant: z.number().int() }),
})
export type AuditPack = z.infer<typeof auditPackSchema>

export const auditPackParamsSchema = z.object({
  lokasyon: z.string().min(1).optional().catch(undefined),
})
