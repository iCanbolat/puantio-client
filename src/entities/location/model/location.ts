import { z } from "zod"

import { serviceLineSchema } from "@/entities/tenant"
import { isoDateTimeSchema } from "@/shared/lib/date"
import {
  GEOFENCE_RADIUS,
  createGeofenceSchema,
  latLngSchema,
  type GeofenceLimits,
} from "@/shared/lib/geo"
import { brandedId, listParamsSchema, paginatedSchema } from "@/shared/types"

export const locationIdSchema = brandedId("LocationId")
export type LocationId = z.infer<typeof locationIdSchema>
export const areaIdSchema = brandedId("AreaId")
export type AreaId = z.infer<typeof areaIdSchema>

export const LOCATION_STATUSES = ["active", "passive"] as const
export const locationStatusSchema = z.enum(LOCATION_STATUSES)
export type LocationStatus = z.infer<typeof locationStatusSchema>
export const LOCATION_STATUS_LABELS: Record<LocationStatus, string> = {
  active: "Aktif",
  passive: "Pasif",
}

/** Lokasyon gereksinim profili (Faz 6 vardiya uygunluk kontrolünde kullanılır) */
export const CERTIFICATE_TYPES = [
  "hygiene",
  "hospital_infection",
  "food_handling",
  "work_at_height",
  "electrical",
  "first_aid",
  "security_id",
  "firearm",
  "airport_permit",
] as const
export const certificateTypeSchema = z.enum(CERTIFICATE_TYPES)
export type CertificateType = z.infer<typeof certificateTypeSchema>
export const CERTIFICATE_LABELS: Record<CertificateType, string> = {
  hygiene: "Hijyen eğitimi",
  hospital_infection: "Hastane enfeksiyon eğitimi",
  food_handling: "Gıda hijyeni",
  work_at_height: "Yüksekte çalışma",
  electrical: "Elektrik yetki belgesi",
  first_aid: "İlk yardım",
  security_id: "ÖGG kimlik kartı",
  firearm: "Silah ruhsatı",
  airport_permit: "Havalimanı giriş kartı",
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Pzt",
  2: "Sal",
  3: "Çar",
  4: "Per",
  5: "Cum",
  6: "Cmt",
  7: "Paz",
}

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat SS:DD biçiminde olmalı")

export const workingHoursSchema = z.object({
  days: z.array(z.number().int().min(1).max(7)),
  start: timeSchema,
  end: timeSchema,
})
export type WorkingHours = z.infer<typeof workingHoursSchema>

export const addressSchema = z.object({
  city: z.string(),
  district: z.string(),
  line: z.string(),
})

export const locationSchema = z.object({
  id: locationIdSchema,
  code: z.string(),
  name: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  orgUnitId: z.string(),
  orgUnitName: z.string(),
  serviceLines: z.array(serviceLineSchema),
  address: addressSchema,
  // Yanıtta kiracı sınırları uygulanmaz (sınırlar sonradan daraltılmış olabilir)
  geofence: z.object({
    center: latLngSchema,
    radiusMeters: z.number().int().positive(),
  }),
  workingHours: workingHoursSchema,
  targetHeadcount: z.number().int().min(0),
  requiredCertificates: z.array(certificateTypeSchema),
  status: locationStatusSchema,
  areaCount: z.number().int().min(0),
  updatedAt: isoDateTimeSchema,
})
export type Location = z.infer<typeof locationSchema>

export const locationListSchema = paginatedSchema(locationSchema)

export const locationMapPointSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
})
export const locationMapPointsSchema = z.object({
  items: z.array(locationMapPointSchema),
})
export type LocationMapPoint = z.infer<typeof locationMapPointSchema>

/** Form şeması geofence sınırlarını kiracı ayarından alır. */
export function createLocationInputSchema(
  limits: GeofenceLimits = GEOFENCE_RADIUS
) {
  return z.object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,20}$/, "Kod 3–20 karakter: harf, rakam ve tire"),
    name: z.string().trim().min(3, "Ad en az 3 karakter olmalı").max(160),
    customerId: z.string({ error: "Müşteri seçin" }).min(1, "Müşteri seçin"),
    orgUnitId: z.string({ error: "Birim seçin" }).min(1, "Birim seçin"),
    serviceLines: z
      .array(serviceLineSchema)
      .min(1, "En az bir hizmet hattı seçin"),
    address: z.object({
      city: z.string().trim().min(2, "İl girin"),
      district: z.string().trim().min(2, "İlçe girin"),
      line: z.string().trim().min(5, "Açık adres girin").max(300),
    }),
    geofence: createGeofenceSchema(limits),
    workingHours: workingHoursSchema
      .refine((value) => value.days.length > 0, {
        message: "En az bir çalışma günü seçin",
        path: ["days"],
      })
      .refine((value) => value.start !== value.end, {
        message: "Başlangıç ve bitiş aynı olamaz",
        path: ["end"],
      }),
    targetHeadcount: z
      .number({ error: "Hedef kadro girin" })
      .int("Tam sayı girin")
      .min(0, "Negatif olamaz")
      .max(5000, "En fazla 5.000"),
    requiredCertificates: z.array(certificateTypeSchema),
    status: locationStatusSchema,
  })
}
export type LocationInput = z.infer<
  ReturnType<typeof createLocationInputSchema>
>

export const LOCATION_SORTABLE_FIELDS = [
  "code",
  "name",
  "customerName",
  "targetHeadcount",
  "updatedAt",
] as const

export const locationListParamsSchema = listParamsSchema.extend({
  sort: z.enum(LOCATION_SORTABLE_FIELDS).optional().catch(undefined),
  orgUnitId: z.string().min(1).optional().catch(undefined),
  customerId: z.string().min(1).optional().catch(undefined),
  status: locationStatusSchema.optional().catch(undefined),
  serviceLine: serviceLineSchema.optional().catch(undefined),
  gorunum: z.enum(["liste", "harita"]).catch("liste"),
})
export type LocationListParams = z.infer<typeof locationListParamsSchema>
