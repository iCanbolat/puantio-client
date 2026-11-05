import { z } from "zod"

import { serviceLineSchema } from "@/entities/tenant"
import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { normalizeTrMobile } from "@/shared/lib/phone"
import { tcknSchema } from "@/shared/lib/tckn"
import { brandedId, listParamsSchema, paginatedSchema } from "@/shared/types"

export const personnelIdSchema = brandedId("PersonnelId")
export type PersonnelId = z.infer<typeof personnelIdSchema>

export const POSITIONS = [
  "cleaning_staff",
  "cleaning_lead",
  "supervisor",
  "security_guard",
  "security_lead",
  "technician",
  "gardener",
  "pest_technician",
  "receptionist",
  "kitchen_staff",
  "laundry_staff",
  "office_support",
  "driver",
] as const
export const positionSchema = z.enum(POSITIONS)
export type Position = z.infer<typeof positionSchema>
export const POSITION_LABELS: Record<Position, string> = {
  cleaning_staff: "Temizlik personeli",
  cleaning_lead: "Temizlik şefi",
  supervisor: "Süpervizör",
  security_guard: "Güvenlik görevlisi",
  security_lead: "Güvenlik amiri",
  technician: "Teknisyen",
  gardener: "Bahçıvan",
  pest_technician: "İlaçlama teknisyeni",
  receptionist: "Resepsiyonist",
  kitchen_staff: "Mutfak personeli",
  laundry_staff: "Çamaşırhane personeli",
  office_support: "Ofis destek",
  driver: "Şoför",
}

export const PERSONNEL_STATUSES = ["active", "passive", "terminated"] as const
export const personnelStatusSchema = z.enum(PERSONNEL_STATUSES)
export type PersonnelStatus = z.infer<typeof personnelStatusSchema>
export const PERSONNEL_STATUS_LABELS: Record<PersonnelStatus, string> = {
  active: "Aktif",
  passive: "Pasif",
  terminated: "Ayrıldı",
}

/** Liste satırı: KVKK gereği TCKN ve telefon maskeli gelir. */
export const personnelSchema = z.object({
  id: personnelIdSchema,
  employeeNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  tcknMasked: z.string(),
  phoneMasked: z.string().nullable(),
  position: positionSchema,
  serviceLine: serviceLineSchema,
  legalEntityId: z.string(),
  legalEntityName: z.string(),
  homeLocationId: z.string().nullable(),
  homeLocationName: z.string().nullable(),
  orgUnitId: z.string().nullable(),
  orgUnitName: z.string().nullable(),
  isFloater: z.boolean(),
  status: personnelStatusSchema,
  hireDate: isoDateSchema,
  terminationDate: isoDateSchema.nullable(),
  updatedAt: isoDateTimeSchema,
})
export type Personnel = z.infer<typeof personnelSchema>

/** Detay: düzenleme yetkisi olana tam TCKN ve telefon döner (ekranda yine maskeli başlar). */
export const personnelDetailSchema = personnelSchema.extend({
  tckn: z.string().nullable(),
  phone: z.string().nullable(),
})
export type PersonnelDetail = z.infer<typeof personnelDetailSchema>

export const personnelListSchema = paginatedSchema(personnelSchema)

export const personnelInputSchema = z
  .object({
    firstName: z.string().trim().min(2, "Ad girin").max(60),
    lastName: z.string().trim().min(2, "Soyad girin").max(60),
    tckn: tcknSchema,
    employeeNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{1,20}$/, "Sicil no 1–20 karakter: harf, rakam, tire"),
    phone: z
      .string()
      .trim()
      .transform((value, context) => {
        if (value === "") return null
        const normalized = normalizeTrMobile(value)
        if (!normalized) {
          context.addIssue({
            code: "custom",
            message: "Geçerli bir cep telefonu girin (5XX XXX XX XX)",
          })
          return z.NEVER
        }
        return normalized
      })
      .nullable(),
    position: positionSchema,
    serviceLine: serviceLineSchema,
    legalEntityId: z
      .string({ error: "Tüzel kişilik seçin" })
      .min(1, "Tüzel kişilik seçin"),
    homeLocationId: z.string().min(1).nullable(),
    isFloater: z.boolean(),
    status: personnelStatusSchema,
    hireDate: isoDateSchema,
    terminationDate: isoDateSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (value.status === "terminated" && !value.terminationDate) {
      context.addIssue({
        code: "custom",
        path: ["terminationDate"],
        message: "Ayrılan personel için çıkış tarihi girin",
      })
    }
    if (value.terminationDate && value.terminationDate < value.hireDate) {
      context.addIssue({
        code: "custom",
        path: ["terminationDate"],
        message: "Çıkış tarihi işe giriş tarihinden önce olamaz",
      })
    }
  })
export type PersonnelInput = z.input<typeof personnelInputSchema>
export type PersonnelPayload = z.output<typeof personnelInputSchema>

export const PERSONNEL_SORTABLE_FIELDS = [
  "employeeNumber",
  "lastName",
  "hireDate",
  "updatedAt",
] as const

export const personnelListParamsSchema = listParamsSchema.extend({
  sort: z.enum(PERSONNEL_SORTABLE_FIELDS).optional().catch(undefined),
  orgUnitId: z.string().min(1).optional().catch(undefined),
  locationId: z.string().min(1).optional().catch(undefined),
  status: personnelStatusSchema.optional().catch(undefined),
  position: positionSchema.optional().catch(undefined),
  legalEntityId: z.string().min(1).optional().catch(undefined),
})
export type PersonnelListParams = z.infer<typeof personnelListParamsSchema>

export function personnelFullName(
  person: Pick<Personnel, "firstName" | "lastName">
): string {
  return `${person.firstName} ${person.lastName}`
}
