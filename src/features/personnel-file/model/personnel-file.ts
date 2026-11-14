import { z } from "zod"

import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { listParamsSchema, paginatedSchema } from "@/shared/types"

export const DOCUMENT_STATES = ["present", "missing", "expired"] as const
export const documentStateSchema = z.enum(DOCUMENT_STATES)
export type DocumentState = z.infer<typeof documentStateSchema>
export const DOCUMENT_STATE_LABELS: Record<DocumentState, string> = {
  present: "Tamam",
  missing: "Eksik",
  expired: "Süresi geçmiş",
}

export const documentVersionSchema = z.object({
  uploadId: z.string(),
  name: z.string(),
  issuedAt: isoDateSchema.nullable(),
  uploadedAt: isoDateTimeSchema,
  uploadedBy: z.string(),
  /** İmzalı, kısa ömürlü adres; yalnızca okuma yetkisinde */
  url: z.string(),
})
export type DocumentVersion = z.infer<typeof documentVersionSchema>

export const personnelFileItemSchema = z.object({
  typeId: z.string(),
  typeName: z.string(),
  required: z.boolean(),
  validityMonths: z.number().int().nullable(),
  state: documentStateSchema,
  validUntil: isoDateSchema.nullable(),
  versions: z.array(documentVersionSchema),
})
export type PersonnelFileItem = z.infer<typeof personnelFileItemSchema>

export const personnelFileSchema = z.object({
  personnelId: z.string(),
  completion: z.number().int().min(0).max(100),
  items: z.array(personnelFileItemSchema),
})
export type PersonnelFile = z.infer<typeof personnelFileSchema>

export const personnelFileSummarySchema = z.object({
  personnelId: z.string(),
  completion: z.number().int().min(0).max(100),
  missingCount: z.number().int(),
  expiredCount: z.number().int(),
})
export type PersonnelFileSummary = z.infer<typeof personnelFileSummarySchema>

export const personnelFileRowSchema = z.object({
  personnelId: z.string(),
  name: z.string(),
  employeeNumber: z.string(),
  locationName: z.string().nullable(),
  orgUnitName: z.string().nullable(),
  completion: z.number().int().min(0).max(100),
  missing: z.array(z.string()),
  expired: z.array(z.string()),
})
export type PersonnelFileRow = z.infer<typeof personnelFileRowSchema>
export const personnelFileListSchema = paginatedSchema(personnelFileRowSchema)
export const personnelFileListParamsSchema = listParamsSchema.extend({
  orgUnitId: z.string().min(1).optional().catch(undefined),
  durum: z.enum(["eksik", "tamam"]).optional().catch(undefined),
})
export type PersonnelFileListParams = z.infer<
  typeof personnelFileListParamsSchema
>

export const documentInputSchema = z.object({
  typeId: z.string().min(1, "Belge türü seçin"),
  uploadId: z.string().min(1, "Dosya yükleyin"),
  issuedAt: isoDateSchema.nullable(),
})
export type DocumentInput = z.infer<typeof documentInputSchema>

/** Yüklenebilir belge: PDF veya görsel, en fazla 10 MB */
export const DOCUMENT_ACCEPT = "application/pdf,image/*"
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
