import { z } from "zod"

import { isoDateTimeSchema } from "@/shared/lib/date"
import { vknSchema } from "@/shared/lib/vkn"
import { brandedId, listParamsSchema, paginatedSchema } from "@/shared/types"

export const customerIdSchema = brandedId("CustomerId")
export type CustomerId = z.infer<typeof customerIdSchema>

export const CUSTOMER_TYPES = ["public", "private"] as const
export const customerTypeSchema = z.enum(CUSTOMER_TYPES)
export type CustomerType = z.infer<typeof customerTypeSchema>
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  public: "Kamu",
  private: "Özel",
}

export const CUSTOMER_SECTORS = [
  "bank",
  "hospital",
  "airport",
  "public_building",
  "office",
  "mall",
  "factory",
  "hotel",
  "education",
  "logistics",
  "other",
] as const
export const customerSectorSchema = z.enum(CUSTOMER_SECTORS)
export type CustomerSector = z.infer<typeof customerSectorSchema>
export const CUSTOMER_SECTOR_LABELS: Record<CustomerSector, string> = {
  bank: "Banka",
  hospital: "Hastane / sağlık",
  airport: "Havalimanı",
  public_building: "Kamu binası",
  office: "Plaza / ofis",
  mall: "AVM",
  factory: "Fabrika / üretim",
  hotel: "Otel",
  education: "Eğitim",
  logistics: "Lojistik / depo",
  other: "Diğer",
}

export const CUSTOMER_STATUSES = ["active", "passive"] as const
export const customerStatusSchema = z.enum(CUSTOMER_STATUSES)
export type CustomerStatus = z.infer<typeof customerStatusSchema>
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Aktif",
  passive: "Pasif",
}

export const customerContactSchema = z.object({
  name: z.string(),
  title: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  isPrimary: z.boolean(),
})
export type CustomerContact = z.infer<typeof customerContactSchema>

export const customerSchema = z.object({
  id: customerIdSchema,
  code: z.string(),
  name: z.string(),
  type: customerTypeSchema,
  sector: customerSectorSchema,
  taxNumber: z.string().nullable(),
  taxOffice: z.string().nullable(),
  contacts: z.array(customerContactSchema),
  status: customerStatusSchema,
  locationCount: z.number().int().min(0),
  updatedAt: isoDateTimeSchema,
})
export type Customer = z.infer<typeof customerSchema>

export const customerListSchema = paginatedSchema(customerSchema)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()

export const customerContactInputSchema = z.object({
  name: z.string().trim().min(2, "İletişim kişisinin adını girin").max(80),
  title: optionalText(80),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^[0-9 +()-]{7,20}$/.test(value),
      "Geçerli bir telefon girin"
    )
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  email: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Geçerli bir e-posta girin"
    )
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  isPrimary: z.boolean(),
})

export const customerInputSchema = z.object({
  name: z.string().trim().min(2, "Müşteri adını girin").max(160),
  type: customerTypeSchema,
  sector: customerSectorSchema,
  taxNumber: z
    .string()
    .trim()
    .refine((value) => value === "" || vknSchema.safeParse(value).success, {
      message: "Geçersiz vergi kimlik numarası",
    })
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  taxOffice: optionalText(80),
  contacts: z.array(customerContactInputSchema).max(10),
  status: customerStatusSchema,
})
export type CustomerInput = z.input<typeof customerInputSchema>
export type CustomerPayload = z.output<typeof customerInputSchema>

export const CUSTOMER_SORTABLE_FIELDS = [
  "code",
  "name",
  "locationCount",
  "updatedAt",
] as const

export const customerListParamsSchema = listParamsSchema.extend({
  sort: z.enum(CUSTOMER_SORTABLE_FIELDS).optional().catch(undefined),
  type: customerTypeSchema.optional().catch(undefined),
  sector: customerSectorSchema.optional().catch(undefined),
  status: customerStatusSchema.optional().catch(undefined),
})
export type CustomerListParams = z.infer<typeof customerListParamsSchema>
