import { foldTr } from "@/shared/lib/format"

import type {
  FieldKind,
  ImportDefinition,
  ImportField,
} from "../model/import-definitions"

export type CellValue = string | number | boolean | Date | null | undefined
export type RawRow = Record<string, CellValue>

/** Sütun eşlemesi: alan anahtarı → Excel başlığı (eşlenmemişse null) */
export type ColumnMapping = Record<string, string | null>

const normalizeHeader = (value: string) =>
  foldTr(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/** Başlıkları alan adları ve eş anlamlılarla Türkçe duyarsız eşleştirir. */
export function autoMapColumns(
  headers: readonly string[],
  fields: readonly ImportField[]
): ColumnMapping {
  const used = new Set<string>()
  const mapping: ColumnMapping = {}
  for (const field of fields) {
    const candidates = [field.label, field.key, ...field.aliases].map(
      normalizeHeader
    )
    const match = headers.find(
      (header) =>
        !used.has(header) && candidates.includes(normalizeHeader(header))
    )
    mapping[field.key] = match ?? null
    if (match) used.add(match)
  }
  return mapping
}

export function missingRequiredFields(
  mapping: ColumnMapping,
  fields: readonly ImportField[]
): ImportField[] {
  return fields.filter((field) => field.required && !mapping[field.key])
}

const pad = (value: number) => String(value).padStart(2, "0")

/** Excel seri tarihi (1900 sistemi) → ISO gün */
export function excelSerialToIso(serial: number): string {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000
  const date = new Date(utc)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** "15.03.2024", "15/03/2024", "2024-03-15", Excel seri sayısı veya Date → "2024-03-15" */
export function parseDateCell(value: CellValue): string | null {
  if (value === null || value === undefined || value === "") return null
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  if (typeof value === "number") return excelSerialToIso(value)
  const text = String(value).trim()
  const tr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text)
  if (tr) return `${tr[3]}-${pad(Number(tr[2]))}-${pad(Number(tr[1]))}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return text
}

const TRUE_VALUES = new Set(["evet", "e", "1", "true", "x", "var"])
const FALSE_VALUES = new Set(["hayir", "h", "0", "false", "", "yok"])

/** Hücre → alan değeri. Dönüştürülemeyen değer olduğu gibi bırakılır (şema hata verir). */
export function convertCell(kind: FieldKind, value: CellValue): unknown {
  const text =
    value === null || value === undefined
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : String(value).trim()
  if (typeof kind === "object") {
    if (text === "") return undefined
    const byLabel = Object.entries(kind.enum).find(
      ([label]) => foldTr(label) === foldTr(text)
    )
    return byLabel ? byLabel[1] : text
  }
  switch (kind) {
    case "text":
      return text === "" ? undefined : text
    case "code":
      return text === "" ? null : text.toLocaleUpperCase("tr-TR")
    case "digits":
      return text === "" ? null : text.replace(/\s/g, "").replace(/\.0+$/, "")
    case "phone":
      return text === "" ? null : text
    case "date":
      return parseDateCell(value) ?? undefined
    case "boolean": {
      const folded = foldTr(text)
      if (TRUE_VALUES.has(folded)) return true
      if (FALSE_VALUES.has(folded)) return false
      return text
    }
    case "number":
    case "decimal": {
      if (text === "") return null
      if (typeof value === "number") return value
      const parsed = Number(
        text
          .replace(/\./g, kind === "decimal" && !text.includes(",") ? "." : "")
          .replace(",", ".")
      )
      return Number.isFinite(parsed) ? parsed : text
    }
  }
}

export interface RowError {
  /** Excel satır numarası (başlık 1. satır; ilk veri 2. satır) */
  row: number
  column: string
  message: string
}

export interface ValidRow<T = Record<string, unknown>> {
  row: number
  data: T
}

export interface ValidationResult<T = Record<string, unknown>> {
  valid: ValidRow<T>[]
  errors: RowError[]
  /** Dosya içinde aynı anahtarla birden fazla geçen satırlar */
  inFileDuplicates: { key: string; rows: number[] }[]
}

/** Satır bazlı Zod doğrulaması + dosya içi mükerrer tespiti. */
export function validateRows(
  definition: ImportDefinition,
  rows: readonly RawRow[],
  mapping: ColumnMapping
): ValidationResult {
  const valid: ValidRow[] = []
  const errors: RowError[] = []
  const labelOf = new Map(
    definition.fields.map((field) => [
      field.key,
      mapping[field.key] ?? field.label,
    ])
  )

  rows.forEach((raw, index) => {
    const row = index + 2
    const input: Record<string, unknown> = {}
    for (const field of definition.fields) {
      const header = mapping[field.key]
      const cell = header ? raw[header] : undefined
      const converted = convertCell(field.kind, cell)
      input[field.key] =
        converted === undefined && !field.required
          ? field.kind === "boolean"
            ? false
            : null
          : converted
    }
    const result = definition.rowSchema.safeParse(input)
    if (result.success) {
      valid.push({ row, data: result.data })
      return
    }
    const seen = new Set<string>()
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "")
      if (seen.has(key)) continue
      seen.add(key)
      errors.push({
        row,
        column: labelOf.get(key) ?? key,
        message:
          issue.code === "invalid_type" && input[key] === undefined
            ? "Zorunlu alan boş"
            : issue.code === "invalid_value"
              ? "Geçersiz değer"
              : issue.message,
      })
    }
  })

  const byKey = new Map<string, number[]>()
  for (const item of valid) {
    const key = item.data[definition.duplicateKey]
    if (typeof key !== "string" || key === "") continue
    const list = byKey.get(key) ?? []
    list.push(item.row)
    byKey.set(key, list)
  }
  const inFileDuplicates = [...byKey.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, rows: list }))

  return { valid, errors, inFileDuplicates }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size))
  return result
}

/** Hata raporu (CSV indirme): başlık + satır, sütun, hata */
export function errorReportRows(
  errors: readonly RowError[]
): (string | number)[][] {
  return [
    ["Satır", "Sütun", "Hata"],
    ...errors.map((error) => [error.row, error.column, error.message]),
  ]
}
