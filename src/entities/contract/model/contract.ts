import { z } from "zod"

import { isoDateSchema } from "@/shared/lib/date"
import { brandedId, listParamsSchema, paginatedSchema } from "@/shared/types"

export const contractIdSchema = brandedId("ContractId")
export type ContractId = z.infer<typeof contractIdSchema>

/**
 * Sözleşme tipi. Personel temini sözleşmesi kapsamındaki puantaj dönemleri müşteri onayı
 * ister (Faz 2 dönem akışı); kamu ihalesinde İKN zorunludur ve KİK fiyat farkı uygulanır.
 */
export const CONTRACT_TYPES = ["public_tender", "private", "staffing"] as const
export const contractTypeSchema = z.enum(CONTRACT_TYPES)
export type ContractType = z.infer<typeof contractTypeSchema>
export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  public_tender: "Kamu ihalesi",
  private: "Özel sözleşme",
  staffing: "Personel temini",
}

/** Durum tarihlerden türetilir; fesih elle işaretlenir. */
export const CONTRACT_STATUSES = [
  "upcoming",
  "active",
  "expired",
  "terminated",
] as const
export const contractStatusSchema = z.enum(CONTRACT_STATUSES)
export type ContractStatus = z.infer<typeof contractStatusSchema>
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  upcoming: "Başlamadı",
  active: "Yürürlükte",
  expired: "Süresi doldu",
  terminated: "Feshedildi",
}
export const CONTRACT_STATUS_TONES = {
  upcoming: "info",
  active: "success",
  expired: "neutral",
  terminated: "danger",
} as const satisfies Record<ContractStatus, string>

export const contractSummarySchema = z.object({
  id: contractIdSchema,
  code: z.string(),
  title: z.string(),
  type: contractTypeSchema,
  status: contractStatusSchema,
  customerId: z.string(),
  customerName: z.string(),
  contractorLegalEntityId: z.string(),
  contractorTitle: z.string(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  versionCount: z.number().int().min(1),
  locationCount: z.number().int().min(0),
  committedHeadcount: z.number().int().min(0),
})
export type ContractSummary = z.infer<typeof contractSummarySchema>
export const contractListSchema = paginatedSchema(contractSummarySchema)

export const CONTRACT_SORTABLE_FIELDS = [
  "code",
  "title",
  "startDate",
  "endDate",
] as const

export const contractListParamsSchema = listParamsSchema.extend({
  sort: z.enum(CONTRACT_SORTABLE_FIELDS).optional().catch(undefined),
  type: contractTypeSchema.optional().catch(undefined),
  status: contractStatusSchema.optional().catch(undefined),
  customerId: z.string().min(1).optional().catch(undefined),
  legalEntityId: z.string().min(1).optional().catch(undefined),
})
export type ContractListParams = z.infer<typeof contractListParamsSchema>
