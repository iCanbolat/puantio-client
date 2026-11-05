import { z } from "zod"

import { isoDateTimeSchema } from "@/shared/lib/date"
import { latLngSchema } from "@/shared/lib/geo"
import { kurusSchema } from "@/shared/lib/money"
import { brandedId, listParamsSchema, paginatedSchema } from "@/shared/types"

/**
 * Faz 0 bileşen vitrini için örnek kayıt. Ortak bileşenleri (DataTable, filtreler,
 * geri sayım, harita) gerçekçi bir API sözleşmesiyle göstermek ve test etmek amacıyla
 * vardır; yalnızca mock modunda yönlendirilir.
 */
export const showcaseRecordIdSchema = brandedId("ShowcaseRecordId")
export type ShowcaseRecordId = z.infer<typeof showcaseRecordIdSchema>

export const SHOWCASE_CATEGORIES = [
  "banka",
  "hastane",
  "havalimani",
  "kamu",
  "ofis",
] as const
export const showcaseCategorySchema = z.enum(SHOWCASE_CATEGORIES)
export type ShowcaseCategory = z.infer<typeof showcaseCategorySchema>

export const SHOWCASE_STATUSES = ["aktif", "askida", "pasif"] as const
export const showcaseStatusSchema = z.enum(SHOWCASE_STATUSES)
export type ShowcaseStatus = z.infer<typeof showcaseStatusSchema>

export const showcaseRecordSchema = z.object({
  id: showcaseRecordIdSchema,
  code: z.string().regex(/^WLC-\d{5}$/),
  name: z.string().min(1),
  city: z.string().min(1),
  category: showcaseCategorySchema,
  status: showcaseStatusSchema,
  /** Kalite puanı 0-100 */
  score: z.number().int().min(0).max(100),
  headcount: z.number().int().min(0),
  monthlyAmount: kurusSchema,
  position: latLngSchema,
  updatedAt: isoDateTimeSchema,
})
export type ShowcaseRecord = z.infer<typeof showcaseRecordSchema>

export const showcaseListSchema = paginatedSchema(showcaseRecordSchema)

export const showcaseRecordUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Ad en az 3 karakter olmalı")
    .max(120, "Ad en fazla 120 karakter olabilir"),
  score: z
    .number({ error: "Puan girin" })
    .int("Puan tam sayı olmalı")
    .min(0, "Puan 0'dan küçük olamaz")
    .max(100, "Puan 100'den büyük olamaz"),
  status: showcaseStatusSchema,
})
export type ShowcaseRecordUpdate = z.infer<typeof showcaseRecordUpdateSchema>

export const SHOWCASE_SORTABLE_FIELDS = [
  "code",
  "name",
  "city",
  "score",
  "headcount",
  "monthlyAmount",
  "updatedAt",
] as const

/** Liste filtreleri: ortak liste parametreleri + kayda özel filtreler. URL ile birebir. */
export const showcaseListParamsSchema = listParamsSchema.extend({
  sort: z.enum(SHOWCASE_SORTABLE_FIELDS).optional().catch(undefined),
  status: showcaseStatusSchema.optional().catch(undefined),
  category: z
    .union([showcaseCategorySchema, z.array(showcaseCategorySchema)])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .optional()
    .catch(undefined),
  city: z.string().min(1).optional().catch(undefined),
  updatedFrom: z.iso.date().optional().catch(undefined),
  updatedTo: z.iso.date().optional().catch(undefined),
})
export type ShowcaseListParams = z.infer<typeof showcaseListParamsSchema>

export const citySuggestionSchema = z.object({
  items: z.array(
    z.object({ value: z.string(), label: z.string(), count: z.number().int() })
  ),
})
export type CitySuggestion = z.infer<
  typeof citySuggestionSchema
>["items"][number]

export const CATEGORY_LABELS: Record<ShowcaseCategory, string> = {
  banka: "Banka şubesi",
  hastane: "Hastane",
  havalimani: "Havalimanı",
  kamu: "Kamu binası",
  ofis: "Plaza / Ofis",
}

export const STATUS_LABELS: Record<ShowcaseStatus, string> = {
  aktif: "Aktif",
  askida: "Askıda",
  pasif: "Pasif",
}
