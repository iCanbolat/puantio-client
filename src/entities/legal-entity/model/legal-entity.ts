import { z } from "zod"

import { isoDateTimeSchema } from "@/shared/lib/date"
import { sgkWorkplaceNumberSchema, vknSchema } from "@/shared/lib/vkn"
import { brandedId } from "@/shared/types"

/**
 * Tüzel kişilik (işveren / yüklenici şirket). Şirketler grubu yapılarında personel, sözleşme,
 * puantaj dönemi ve bordro dosyası tüzel kişilik bazında ayrılır.
 */
export const legalEntityIdSchema = brandedId("LegalEntityId")
export type LegalEntityId = z.infer<typeof legalEntityIdSchema>

export const legalEntitySchema = z.object({
  id: legalEntityIdSchema,
  title: z.string().min(1),
  taxNumber: z.string().regex(/^\d{10}$/),
  taxOffice: z.string().min(1),
  sgkWorkplaceNumbers: z.array(z.string()),
  eInvoiceEnabled: z.boolean(),
  address: z.string().nullable(),
  isActive: z.boolean(),
  personnelCount: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  /** Varsayılan bordro aktarım profili (Faz 2). Eski yanıtlarda yoksa `null`. */
  payrollProfileId: z.string().nullable().default(null),
})
export type LegalEntity = z.infer<typeof legalEntitySchema>

export const legalEntityListSchema = z.object({
  items: z.array(legalEntitySchema),
})

export const legalEntityInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Unvan en az 3 karakter olmalı")
    .max(200, "Unvan en fazla 200 karakter olabilir"),
  taxNumber: vknSchema,
  taxOffice: z.string().trim().min(2, "Vergi dairesini girin").max(80),
  sgkWorkplaceNumbers: z
    .array(sgkWorkplaceNumberSchema)
    .max(20, "En fazla 20 işyeri sicil numarası girilebilir"),
  eInvoiceEnabled: z.boolean(),
  address: z.string().trim().max(300).nullable(),
  isActive: z.boolean(),
})
export type LegalEntityInput = z.infer<typeof legalEntityInputSchema>
