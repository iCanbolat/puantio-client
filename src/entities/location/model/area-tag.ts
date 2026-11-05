import { z } from "zod"

import { isoDateTimeSchema } from "@/shared/lib/date"

import { areaIdSchema } from "./location"

export const AREA_TYPES = [
  "restroom",
  "office",
  "corridor",
  "kitchen",
  "dining",
  "meeting",
  "lobby",
  "patient_room",
  "parking",
  "outdoor",
  "technical",
  "checkpoint",
  "other",
] as const
export const areaTypeSchema = z.enum(AREA_TYPES)
export type AreaType = z.infer<typeof areaTypeSchema>
export const AREA_TYPE_LABELS: Record<AreaType, string> = {
  restroom: "Tuvalet / lavabo",
  office: "Ofis",
  corridor: "Koridor",
  kitchen: "Mutfak / çay ocağı",
  dining: "Yemekhane",
  meeting: "Toplantı salonu",
  lobby: "Lobi / giriş",
  patient_room: "Hasta odası",
  parking: "Otopark",
  outdoor: "Dış alan / bahçe",
  technical: "Teknik oda",
  checkpoint: "Kontrol noktası",
  other: "Diğer",
}

export const TAG_KINDS = ["qr", "nfc"] as const
export const tagKindSchema = z.enum(TAG_KINDS)
export type TagKind = z.infer<typeof tagKindSchema>

export const tagSchema = z.object({
  id: z.string(),
  targetType: z.enum(["location", "area"]),
  targetId: z.string(),
  kind: tagKindSchema,
  /** QR: public bildirim token'ı · NFC: etiket UID'si */
  value: z.string(),
  status: z.enum(["active", "revoked"]),
  createdAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
})
export type Tag = z.infer<typeof tagSchema>
export const tagListSchema = z.object({ items: z.array(tagSchema) })

export const areaSchema = z.object({
  id: areaIdSchema,
  locationId: z.string(),
  name: z.string(),
  type: areaTypeSchema,
  floor: z.string().nullable(),
  qrToken: z.string().nullable(),
  nfcUid: z.string().nullable(),
})
export type Area = z.infer<typeof areaSchema>
export const areaListSchema = z.object({ items: z.array(areaSchema) })

export const areaInputSchema = z.object({
  name: z.string().trim().min(2, "Alan adı girin").max(80),
  type: areaTypeSchema,
  floor: z
    .string()
    .trim()
    .max(20)
    .transform((value) => (value === "" ? null : value))
    .nullable(),
})
export type AreaInput = z.input<typeof areaInputSchema>

/** NFC etiket UID'si: 4, 7 veya 10 bayt, iki nokta ile ayrılmış onaltılık ("04:A2:3B:1C:5D:80:90") */
export const nfcUidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^(?:[0-9A-F]{2}:){3}(?:(?:[0-9A-F]{2}:){3}|(?:[0-9A-F]{2}:){6})?[0-9A-F]{2}$/,
    "NFC UID 4, 7 veya 10 bayt olmalı (ör. 04:A2:3B:1C:5D:80:90)"
  )

export const tagLabelSchema = z.object({
  locationCode: z.string(),
  locationName: z.string(),
  areaName: z.string().nullable(),
  token: z.string(),
})
export type TagLabel = z.infer<typeof tagLabelSchema>
export const tagLabelListSchema = z.object({ items: z.array(tagLabelSchema) })
