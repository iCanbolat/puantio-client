import type { CellCode } from "@/features/timesheet"
import { encodeText } from "@/shared/lib/encoding"

import type { PayrollProfileSettings, ProfileColumn } from "../model/profile"

/** Bordro satırının kaynağı: puantaj satırı + personel kimlik bilgileri */
export interface PayrollSourceRow {
  personnelId: string
  employeeNumber: string
  tckn: string
  firstName: string
  lastName: string
  locationCode: string
  cells: {
    date: string
    code: CellCode | null
    overtimeHours: number
    nightHours: number
    holidayWorkHours: number
    weeklyRestWorkHours: number
    missingHours: number
  }[]
}

export interface PayrollContext {
  year: number
  month: number
  legalEntityTitle: string
}

export type PayrollValue = string | number

export interface PayrollTableRow {
  personnelId: string
  name: string
  values: PayrollValue[]
  errors: string[]
}

export interface PayrollTable {
  headers: string[]
  rows: PayrollTableRow[]
}

/** Yarım gün (arefe) her kolona 0,5 gün yazılır */
const dayWeight = (code: CellCode) => (code === "YG" ? 0.5 : 1)

function expandColumns(
  profile: PayrollProfileSettings,
  dayCount: number
): { header: string; column: ProfileColumn; day?: number }[] {
  return profile.columns.flatMap((column) =>
    column.source.kind === "dailyCodes"
      ? Array.from({ length: dayCount }, (_, index) => ({
          header: `${column.header} ${index + 1}`,
          column,
          day: index,
        }))
      : [{ header: column.header, column }]
  )
}

function fieldValue(
  row: PayrollSourceRow,
  context: PayrollContext,
  field: Extract<ProfileColumn["source"], { kind: "field" }>["field"]
): PayrollValue {
  switch (field) {
    case "employeeNumber":
      return row.employeeNumber
    case "tckn":
      return row.tckn
    case "firstName":
      return row.firstName
    case "lastName":
      return row.lastName
    case "periodYear":
      return context.year
    case "periodMonth":
      return context.month
    case "locationCode":
      return row.locationCode
    case "legalEntityTitle":
      return context.legalEntityTitle
  }
}

const sum = (values: number[]) =>
  Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100

const MEASURE_KEY = {
  overtime: "overtimeHours",
  weeklyRestWork: "weeklyRestWorkHours",
  holidayWork: "holidayWorkHours",
  night: "nightHours",
  missing: "missingHours",
} as const

const fmt = (value: number) => String(value).replace(".", ",")

/**
 * Puantaj satırlarını profil kolonlarına dönüştürür ve doğrular:
 * - Belirsiz gün (boş / `?`) varsa satır hatalıdır.
 * - Profilde gün kolonları varsa, toplamları istihdam edilen gün sayısına (ör. Eylül = 30)
 *   eşit olmalıdır. Kod eşlemesinde unutulan kod bu kontrolle yakalanır.
 */
export function buildPayrollTable(
  profile: PayrollProfileSettings,
  context: PayrollContext,
  rows: readonly PayrollSourceRow[]
): PayrollTable {
  const dayCount = rows[0]?.cells.length ?? 0
  const columns = expandColumns(profile, dayCount)
  const daysColumns = profile.columns.filter(
    (column) => column.source.kind === "days"
  )

  return {
    headers: columns.map((column) => column.header),
    rows: rows.map((row) => {
      const errors: string[] = []
      const values = columns.map(({ column, day }): PayrollValue => {
        const source = column.source
        switch (source.kind) {
          case "field":
            return fieldValue(row, context, source.field)
          case "days": {
            const codes = new Set(source.codes)
            return sum(
              row.cells
                .filter((cell) => cell.code !== null && codes.has(cell.code))
                .map((cell) => dayWeight(cell.code as CellCode))
            )
          }
          case "hours":
            return sum(
              row.cells.map((cell) => cell[MEASURE_KEY[source.measure]])
            )
          case "dailyCodes": {
            const code = row.cells[day ?? 0]?.code ?? null
            if (code === null) return ""
            return profile.codeMap[code] ?? code
          }
        }
      })

      const unresolved = row.cells.filter(
        (cell) => cell.code === null || cell.code === "?"
      )
      const firstUnresolved = unresolved[0]
      if (firstUnresolved) {
        const first = firstUnresolved.date.split("-").reverse().join(".")
        errors.push(
          `${unresolved.length} günün kodu belirsiz (ilk: ${first}); puantajı düzeltin.`
        )
      }

      if (daysColumns.length > 0) {
        const expected = row.cells.filter((cell) => cell.code !== "-").length
        const total = sum(
          daysColumns.flatMap((column) => {
            if (column.source.kind !== "days") return []
            const codes = new Set(column.source.codes)
            return row.cells
              .filter((cell) => cell.code !== null && codes.has(cell.code))
              .map((cell) => dayWeight(cell.code as CellCode))
          })
        )
        if (total !== expected) {
          errors.push(
            `Gün toplamı ${fmt(total)}; dönemde ${expected} gün olmalı. Kod eşlemesini veya puantajı kontrol edin.`
          )
        }
      }

      return {
        personnelId: row.personnelId,
        name: `${row.firstName} ${row.lastName}`,
        values,
        errors,
      }
    }),
  }
}

export function formatPayrollValue(
  value: PayrollValue,
  decimalSeparator: "," | "."
): string {
  if (typeof value === "string") return value
  const text = Number.isInteger(value) ? String(value) : String(value)
  return decimalSeparator === "," ? text.replace(".", ",") : text
}

function escapeDelimited(text: string, delimiter: string): string {
  if (
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

/** Ayraçlı metin (CSV). Satır sonu CRLF (Windows bordro yazılımları). */
export function renderDelimited(
  table: PayrollTable,
  profile: Pick<
    PayrollProfileSettings,
    "delimiter" | "decimalSeparator" | "includeHeader"
  >
): string {
  const lines = [
    ...(profile.includeHeader ? [table.headers] : []),
    ...table.rows.map((row) =>
      row.values.map((value) =>
        formatPayrollValue(value, profile.decimalSeparator)
      )
    ),
  ]
  return (
    lines
      .map((cells) =>
        cells
          .map((cell) => escapeDelimited(cell, profile.delimiter))
          .join(profile.delimiter)
      )
      .join("\r\n") + "\r\n"
  )
}

/** Sabit genişlikli metin (TXT): her kolon `width` karaktere tamamlanır/kırpılır. */
export function renderFixedWidth(
  table: PayrollTable,
  profile: Pick<
    PayrollProfileSettings,
    "columns" | "decimalSeparator" | "includeHeader"
  >
): string {
  const widths = profile.columns.flatMap((column) => {
    const width = column.width ?? 10
    return column.source.kind === "dailyCodes"
      ? Array.from(
          {
            length: Math.max(
              0,
              table.headers.length - profile.columns.length + 1
            ),
          },
          () => width
        )
      : [width]
  })
  const pad = (text: string, width: number, numeric: boolean) =>
    (numeric ? text.padStart(width) : text.padEnd(width)).slice(0, width)
  const lines = [
    ...(profile.includeHeader
      ? [
          table.headers.map((header, index) =>
            pad(header, widths[index] ?? 10, false)
          ),
        ]
      : []),
    ...table.rows.map((row) =>
      row.values.map((value, index) =>
        pad(
          formatPayrollValue(value, profile.decimalSeparator),
          widths[index] ?? 10,
          typeof value === "number"
        )
      )
    ),
  ]
  return lines.map((cells) => cells.join("")).join("\r\n") + "\r\n"
}

/** Metin tabanlı (CSV/TXT) dosyanın baytları. UTF-8 CSV'de Excel için BOM eklenir. */
export function renderTextFile(
  table: PayrollTable,
  profile: PayrollProfileSettings
): Uint8Array<ArrayBuffer> {
  const text =
    profile.format === "txt"
      ? renderFixedWidth(table, profile)
      : renderDelimited(table, profile)
  return encodeText(text, profile.encoding, {
    bom: profile.encoding === "utf-8" && profile.format === "csv",
  })
}

export function payrollFileName(
  profile: Pick<PayrollProfileSettings, "format">,
  context: PayrollContext,
  legalEntityShort: string
): string {
  const month = String(context.month).padStart(2, "0")
  return `puantaj-${legalEntityShort}-${context.year}-${month}.${profile.format}`
}
