import { z } from "zod"

import { CELL_CODES, cellCodeSchema, type CellCode } from "@/features/timesheet"
import { isoDateTimeSchema } from "@/shared/lib/date"
import { brandedId } from "@/shared/types"

/**
 * Bordro aktarım profili: puantajın hangi kolonlara, hangi kodlamayla ve biçimde yazılacağı.
 * Hazır profiller platform kütüphanesindedir; kiracı kendi kopyasını düzenler.
 */
export const payrollProfileIdSchema = brandedId("PayrollProfileId")
export type PayrollProfileId = z.infer<typeof payrollProfileIdSchema>

export const PAYROLL_FORMATS = ["xlsx", "csv", "txt"] as const
export const payrollFormatSchema = z.enum(PAYROLL_FORMATS)
export type PayrollFormat = z.infer<typeof payrollFormatSchema>
export const PAYROLL_FORMAT_LABELS: Record<PayrollFormat, string> = {
  xlsx: "Excel (.xlsx)",
  csv: "CSV (ayraçlı)",
  txt: "TXT (sabit genişlik)",
}

export const PAYROLL_ENCODINGS = ["utf-8", "windows-1254"] as const
export const payrollEncodingSchema = z.enum(PAYROLL_ENCODINGS)
export type PayrollEncoding = z.infer<typeof payrollEncodingSchema>
export const PAYROLL_ENCODING_LABELS: Record<PayrollEncoding, string> = {
  "utf-8": "UTF-8",
  "windows-1254": "Windows-1254 (Türkçe ANSI)",
}

export const DELIMITERS = [";", ",", "\t", "|"] as const
export const delimiterSchema = z.enum(DELIMITERS)
export const DELIMITER_LABELS: Record<(typeof DELIMITERS)[number], string> = {
  ";": "Noktalı virgül (;)",
  ",": "Virgül (,)",
  "\t": "Sekme",
  "|": "Dikey çizgi (|)",
}

export const PAYROLL_FIELDS = [
  "employeeNumber",
  "tckn",
  "firstName",
  "lastName",
  "periodYear",
  "periodMonth",
  "locationCode",
  "legalEntityTitle",
] as const
export const payrollFieldSchema = z.enum(PAYROLL_FIELDS)
export type PayrollField = z.infer<typeof payrollFieldSchema>
export const PAYROLL_FIELD_LABELS: Record<PayrollField, string> = {
  employeeNumber: "Sicil no",
  tckn: "T.C. Kimlik No",
  firstName: "Ad",
  lastName: "Soyad",
  periodYear: "Dönem yılı",
  periodMonth: "Dönem ayı",
  locationCode: "Lokasyon kodu",
  legalEntityTitle: "Tüzel kişilik",
}

export const HOUR_MEASURES = [
  "overtime",
  "weeklyRestWork",
  "holidayWork",
  "night",
  "missing",
] as const
export const hourMeasureSchema = z.enum(HOUR_MEASURES)
export type HourMeasure = z.infer<typeof hourMeasureSchema>
export const HOUR_MEASURE_LABELS: Record<HourMeasure, string> = {
  overtime: "Fazla mesai saati",
  weeklyRestWork: "Hafta tatili çalışması (saat)",
  holidayWork: "Genel tatil çalışması (saat)",
  night: "Gece çalışması (saat)",
  missing: "Eksik saat",
}

export const columnSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field"), field: payrollFieldSchema }),
  /** Kodların gün toplamı. Yarım gün (YG) her kolona 0,5 yazılır */
  z.object({ kind: z.literal("days"), codes: z.array(cellCodeSchema).min(1) }),
  z.object({ kind: z.literal("hours"), measure: hourMeasureSchema }),
  /** Ayın her günü için bir kolon; değer kod eşlemesinden gelir */
  z.object({ kind: z.literal("dailyCodes") }),
])
export type ColumnSource = z.infer<typeof columnSourceSchema>

export const profileColumnSchema = z.object({
  header: z.string().trim().min(1, "Kolon başlığı girin").max(40),
  source: columnSourceSchema,
  /** Yalnızca TXT (sabit genişlik) */
  width: z.number().int().min(1).max(60).nullable(),
})
export type ProfileColumn = z.infer<typeof profileColumnSchema>

export const codeMapSchema = z.partialRecord(cellCodeSchema, z.string().max(8))
export type CodeMap = Partial<Record<CellCode, string>>

export const LIBRARY_KEYS = ["logo-bordro-plus", "generic-csv"] as const
export const libraryKeySchema = z.enum(LIBRARY_KEYS)
export type LibraryKey = z.infer<typeof libraryKeySchema>

export const payrollProfileSettingsSchema = z.object({
  name: z.string().trim().min(3, "Profil adı en az 3 karakter").max(80),
  description: z.string().trim().max(200),
  format: payrollFormatSchema,
  encoding: payrollEncodingSchema,
  delimiter: delimiterSchema,
  decimalSeparator: z.enum([",", "."]),
  includeHeader: z.boolean(),
  columns: z
    .array(profileColumnSchema)
    .min(1, "En az bir kolon ekleyin")
    .max(60),
  codeMap: codeMapSchema,
})
export type PayrollProfileSettings = z.infer<
  typeof payrollProfileSettingsSchema
>

export const payrollProfileSchema = payrollProfileSettingsSchema.extend({
  id: payrollProfileIdSchema,
  /** Hazır profilin kopyasıysa kaynağı */
  libraryKey: libraryKeySchema.nullable(),
  /** Gerçek şablonla doğrulanmamış hazır profil ("taklit") */
  simulated: z.boolean(),
  updatedAt: isoDateTimeSchema,
  /** Varsayılan profil olarak atandığı tüzel kişilikler */
  legalEntityIds: z.array(z.string()),
})
export type PayrollProfile = z.infer<typeof payrollProfileSchema>
export const payrollProfileListSchema = z.object({
  items: z.array(payrollProfileSchema),
})

export const previewRowSchema = z.object({
  personnelId: z.string(),
  name: z.string(),
  values: z.array(z.union([z.string(), z.number()])),
  errors: z.array(z.string()),
})
export type PreviewRow = z.infer<typeof previewRowSchema>

export const payrollPreviewSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(previewRowSchema),
  totalRows: z.number().int(),
  errorRows: z.number().int(),
  fileName: z.string(),
})
export type PayrollPreview = z.infer<typeof payrollPreviewSchema>

export const payrollExportSchema = z.object({
  id: z.string(),
  periodId: z.string(),
  periodLabel: z.string(),
  legalEntityTitle: z.string(),
  profileId: z.string(),
  profileName: z.string(),
  fileName: z.string(),
  format: payrollFormatSchema,
  encoding: payrollEncodingSchema,
  rowCount: z.number().int(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string(),
})
export type PayrollExport = z.infer<typeof payrollExportSchema>
export const payrollExportListSchema = z.object({
  items: z.array(payrollExportSchema),
})

export const exportRequestSchema = z.object({
  periodId: z.string().min(1),
  profileId: z.string().min(1),
})
export type ExportRequest = z.infer<typeof exportRequestSchema>

export const ALL_CELL_CODES = CELL_CODES
