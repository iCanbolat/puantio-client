import { z } from "zod"

import {
  CUSTOMER_SECTOR_LABELS,
  CUSTOMER_TYPE_LABELS,
  customerSectorSchema,
  customerTypeSchema,
} from "@/entities/customer"
import { POSITION_LABELS, positionSchema } from "@/entities/personnel"
import { SERVICE_LINE_LABELS, serviceLineSchema } from "@/entities/tenant"
import { isoDateSchema } from "@/shared/lib/date"
import { normalizeTrMobile } from "@/shared/lib/phone"
import { tcknSchema } from "@/shared/lib/tckn"
import { sgkWorkplaceNumberSchema, vknSchema } from "@/shared/lib/vkn"

export const IMPORT_ENTITIES = [
  "personnel",
  "locations",
  "customers",
  "legal-entities",
] as const
export const importEntitySchema = z.enum(IMPORT_ENTITIES)
export type ImportEntity = z.infer<typeof importEntitySchema>

/** Hücre ham değeri → alan değeri dönüşümü (biçim). İçerik doğrulamasını satır şeması yapar. */
export type FieldKind =
  | "text"
  | "code"
  | "digits"
  | "phone"
  | "date"
  | "boolean"
  | "number"
  | "decimal"
  | { enum: Record<string, string> }

export interface ImportField {
  key: string
  label: string
  /** Excel başlığı eşleştirmesinde kabul edilen eş anlamlılar */
  aliases: readonly string[]
  required: boolean
  kind: FieldKind
  example: string
}

export interface ImportDefinition {
  entity: ImportEntity
  label: string
  fields: readonly ImportField[]
  /** Dosya içi ve sistemdeki mükerrerlik anahtarı */
  duplicateKey: string
  duplicateLabel: string
  rowSchema: z.ZodType<Record<string, unknown>>
}

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()

const phoneField = z
  .string()
  .nullable()
  .transform((value, context) => {
    if (!value) return null
    const normalized = normalizeTrMobile(value)
    if (!normalized) {
      context.addIssue({
        code: "custom",
        message: "Geçerli bir cep telefonu girin",
      })
      return z.NEVER
    }
    return normalized
  })

const personnelRowSchema = z.object({
  employeeNumber: z
    .string({ error: "Sicil no zorunlu" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,20}$/, "Sicil no 1–20 karakter: harf, rakam, tire"),
  firstName: z.string({ error: "Ad zorunlu" }).trim().min(2, "Ad girin"),
  lastName: z.string({ error: "Soyad zorunlu" }).trim().min(2, "Soyad girin"),
  tckn: tcknSchema,
  phone: phoneField,
  position: positionSchema,
  serviceLine: serviceLineSchema,
  legalEntityTaxNumber: vknSchema,
  homeLocationCode: optionalText,
  hireDate: isoDateSchema,
  isFloater: z.boolean(),
})
export type PersonnelImportRow = z.infer<typeof personnelRowSchema>

const locationRowSchema = z.object({
  code: z
    .string({ error: "Kod zorunlu" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,20}$/, "Kod 3–20 karakter: harf, rakam ve tire"),
  name: z.string({ error: "Ad zorunlu" }).trim().min(3, "Ad en az 3 karakter"),
  customerName: z.string({ error: "Müşteri zorunlu" }).trim().min(2),
  orgUnitCode: z.string({ error: "Birim kodu zorunlu" }).trim().toUpperCase(),
  city: z.string({ error: "İl zorunlu" }).trim().min(2),
  district: z.string({ error: "İlçe zorunlu" }).trim().min(2),
  addressLine: z
    .string({ error: "Adres zorunlu" })
    .trim()
    .min(5, "Açık adres girin"),
  lat: z
    .number({ error: "Enlem girin" })
    .min(35, "Enlem Türkiye dışında")
    .max(43, "Enlem Türkiye dışında"),
  lng: z
    .number({ error: "Boylam girin" })
    .min(25, "Boylam Türkiye dışında")
    .max(45, "Boylam Türkiye dışında"),
  radiusMeters: z.number().int().nullable(),
  targetHeadcount: z.number().int().min(0).nullable(),
})
export type LocationImportRow = z.infer<typeof locationRowSchema>

const customerRowSchema = z.object({
  name: z.string({ error: "Müşteri adı zorunlu" }).trim().min(2),
  type: customerTypeSchema,
  sector: customerSectorSchema,
  taxNumber: z
    .string()
    .nullable()
    .refine(
      (value) => !value || vknSchema.safeParse(value).success,
      "Geçersiz vergi kimlik numarası"
    ),
  taxOffice: optionalText,
  contactName: optionalText,
  contactPhone: optionalText,
  contactEmail: z
    .string()
    .nullable()
    .refine(
      (value) => !value || z.email().safeParse(value).success,
      "Geçerli bir e-posta girin"
    ),
})
export type CustomerImportRow = z.infer<typeof customerRowSchema>

const legalEntityRowSchema = z.object({
  title: z.string({ error: "Unvan zorunlu" }).trim().min(3),
  taxNumber: vknSchema,
  taxOffice: z.string({ error: "Vergi dairesi zorunlu" }).trim().min(2),
  sgkWorkplaceNumber: sgkWorkplaceNumberSchema.nullable(),
})
export type LegalEntityImportRow = z.infer<typeof legalEntityRowSchema>

const invert = (labels: Record<string, string>) =>
  Object.fromEntries(Object.entries(labels).map(([key, label]) => [label, key]))

export function buildImportDefinitions(terms: {
  location: string
  orgLevel: string
}): Record<ImportEntity, ImportDefinition> {
  return {
    personnel: {
      entity: "personnel",
      label: "Personel",
      duplicateKey: "tckn",
      duplicateLabel: "T.C. Kimlik No",
      rowSchema: personnelRowSchema,
      fields: [
        {
          key: "employeeNumber",
          label: "Sicil No",
          aliases: ["sicil", "sicil no", "sicil numarası", "personel no"],
          required: true,
          kind: "code",
          example: "S00123",
        },
        {
          key: "tckn",
          label: "T.C. Kimlik No",
          aliases: ["tc", "tckn", "tc kimlik", "tc kimlik no", "kimlik no"],
          required: true,
          kind: "digits",
          example: "10000000146",
        },
        {
          key: "firstName",
          label: "Ad",
          aliases: ["adı", "isim"],
          required: true,
          kind: "text",
          example: "Ayşe",
        },
        {
          key: "lastName",
          label: "Soyad",
          aliases: ["soyadı", "soyisim"],
          required: true,
          kind: "text",
          example: "Yılmaz",
        },
        {
          key: "phone",
          label: "Cep Telefonu",
          aliases: ["telefon", "gsm", "cep", "cep tel"],
          required: false,
          kind: "phone",
          example: "0532 123 45 67",
        },
        {
          key: "position",
          label: "Pozisyon",
          aliases: ["görev", "unvan", "pozisyonu"],
          required: true,
          kind: { enum: invert(POSITION_LABELS) },
          example: "Temizlik personeli",
        },
        {
          key: "serviceLine",
          label: "Hizmet Hattı",
          aliases: ["hizmet", "hizmet türü"],
          required: true,
          kind: { enum: invert(SERVICE_LINE_LABELS) },
          example: "Temizlik",
        },
        {
          key: "legalEntityTaxNumber",
          label: "İşveren VKN",
          aliases: [
            "vkn",
            "tüzel kişilik vkn",
            "işveren vergi no",
            "şirket vkn",
          ],
          required: true,
          kind: "digits",
          example: "1234567890",
        },
        {
          key: "homeLocationCode",
          label: `${terms.location} Kodu`,
          aliases: [
            "lokasyon kodu",
            "proje kodu",
            "tesis kodu",
            "görev yeri kodu",
            "lokasyon",
          ],
          required: false,
          kind: "code",
          example: "LOK-00001",
        },
        {
          key: "hireDate",
          label: "İşe Giriş Tarihi",
          aliases: ["işe giriş", "giriş tarihi", "işe başlama"],
          required: true,
          kind: "date",
          example: "15.03.2024",
        },
        {
          key: "isFloater",
          label: "Yedek Havuzu",
          aliases: ["yedek", "yedek personel"],
          required: false,
          kind: "boolean",
          example: "Hayır",
        },
      ],
    },
    locations: {
      entity: "locations",
      label: terms.location,
      duplicateKey: "code",
      duplicateLabel: "Kod",
      rowSchema: locationRowSchema,
      fields: [
        {
          key: "code",
          label: "Kod",
          aliases: ["lokasyon kodu", "proje kodu", "tesis kodu"],
          required: true,
          kind: "code",
          example: "LOK-00123",
        },
        {
          key: "name",
          label: "Ad",
          aliases: ["lokasyon adı", "proje adı", "tesis adı", "adı"],
          required: true,
          kind: "text",
          example: "Merkez Şube",
        },
        {
          key: "customerName",
          label: "Müşteri",
          aliases: ["müşteri adı", "firma"],
          required: true,
          kind: "text",
          example: "Toros Bankası",
        },
        {
          key: "orgUnitCode",
          label: `${terms.orgLevel} Kodu`,
          aliases: ["bölge kodu", "bölge", "birim kodu"],
          required: true,
          kind: "code",
          example: "IST-AVR",
        },
        {
          key: "city",
          label: "İl",
          aliases: ["şehir"],
          required: true,
          kind: "text",
          example: "İstanbul",
        },
        {
          key: "district",
          label: "İlçe",
          aliases: ["semt"],
          required: true,
          kind: "text",
          example: "Şişli",
        },
        {
          key: "addressLine",
          label: "Adres",
          aliases: ["açık adres"],
          required: true,
          kind: "text",
          example: "Büyükdere Cad. No:1",
        },
        {
          key: "lat",
          label: "Enlem",
          aliases: ["latitude", "lat"],
          required: true,
          kind: "decimal",
          example: "41,0612",
        },
        {
          key: "lng",
          label: "Boylam",
          aliases: ["longitude", "lng", "lon"],
          required: true,
          kind: "decimal",
          example: "28,9877",
        },
        {
          key: "radiusMeters",
          label: "Geofence Yarıçapı (m)",
          aliases: ["yarıçap", "geofence"],
          required: false,
          kind: "number",
          example: "100",
        },
        {
          key: "targetHeadcount",
          label: "Hedef Kadro",
          aliases: ["kadro", "personel sayısı"],
          required: false,
          kind: "number",
          example: "4",
        },
      ],
    },
    customers: {
      entity: "customers",
      label: "Müşteri",
      duplicateKey: "taxNumber",
      duplicateLabel: "VKN",
      rowSchema: customerRowSchema,
      fields: [
        {
          key: "name",
          label: "Müşteri Adı",
          aliases: ["ad", "unvan", "firma adı"],
          required: true,
          kind: "text",
          example: "Toros Bankası",
        },
        {
          key: "type",
          label: "Tür",
          aliases: ["kamu/özel", "müşteri türü"],
          required: true,
          kind: { enum: invert(CUSTOMER_TYPE_LABELS) },
          example: "Özel",
        },
        {
          key: "sector",
          label: "Sektör",
          aliases: ["sektörü"],
          required: true,
          kind: { enum: invert(CUSTOMER_SECTOR_LABELS) },
          example: "Banka",
        },
        {
          key: "taxNumber",
          label: "VKN",
          aliases: ["vergi no", "vergi kimlik no"],
          required: false,
          kind: "digits",
          example: "1234567890",
        },
        {
          key: "taxOffice",
          label: "Vergi Dairesi",
          aliases: ["vd"],
          required: false,
          kind: "text",
          example: "Kozyatağı",
        },
        {
          key: "contactName",
          label: "İletişim Kişisi",
          aliases: ["yetkili", "ilgili kişi"],
          required: false,
          kind: "text",
          example: "Ali Veli",
        },
        {
          key: "contactPhone",
          label: "İletişim Telefonu",
          aliases: ["telefon", "yetkili telefon"],
          required: false,
          kind: "text",
          example: "0212 123 45 67",
        },
        {
          key: "contactEmail",
          label: "İletişim E-postası",
          aliases: ["e-posta", "eposta", "email"],
          required: false,
          kind: "text",
          example: "ali@musteri.com",
        },
      ],
    },
    "legal-entities": {
      entity: "legal-entities",
      label: "Tüzel kişilik",
      duplicateKey: "taxNumber",
      duplicateLabel: "VKN",
      rowSchema: legalEntityRowSchema,
      fields: [
        {
          key: "title",
          label: "Unvan",
          aliases: ["şirket unvanı", "ad"],
          required: true,
          kind: "text",
          example: "Örnek Temizlik A.Ş.",
        },
        {
          key: "taxNumber",
          label: "VKN",
          aliases: ["vergi no", "vergi kimlik no"],
          required: true,
          kind: "digits",
          example: "1234567890",
        },
        {
          key: "taxOffice",
          label: "Vergi Dairesi",
          aliases: ["vd"],
          required: true,
          kind: "text",
          example: "Kozyatağı",
        },
        {
          key: "sgkWorkplaceNumber",
          label: "SGK İşyeri Sicil No",
          aliases: ["sgk sicil", "işyeri sicil no"],
          required: false,
          kind: "digits",
          example: "12345678901234567890123456",
        },
      ],
    },
  }
}

export const DUPLICATE_STRATEGIES = ["update", "skip"] as const
export type DuplicateStrategy = (typeof DUPLICATE_STRATEGIES)[number]

export const importCheckResponseSchema = z.object({
  existing: z.array(z.object({ key: z.string(), label: z.string() })),
})

export const importBatchResponseSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ index: z.number().int(), message: z.string() })),
})
export type ImportBatchResult = z.infer<typeof importBatchResponseSchema>
