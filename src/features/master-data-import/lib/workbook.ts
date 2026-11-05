import * as XLSX from "xlsx"

import type { ImportDefinition } from "../model/import-definitions"
import type { RawRow } from "../domain/import-domain"

export interface ParsedSheet {
  name: string
  headers: string[]
  rows: RawRow[]
}

/** Excel/CSV dosyasını okur: her sayfa için başlık satırı ve veri satırları. */
export async function readWorkbook(file: File): Promise<ParsedSheet[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet) return { name, headers: [], rows: [] }
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
    })
    const headers = (matrix[0] ?? [])
      .map((cell) =>
        typeof cell === "string" || typeof cell === "number"
          ? String(cell).trim()
          : ""
      )
      .filter((header) => header !== "")
    const rows = XLSX.utils
      .sheet_to_json<RawRow>(sheet, { defval: null, raw: true })
      .filter((row) =>
        Object.values(row).some((value) => value !== null && value !== "")
      )
    return { name, headers, rows }
  })
}

/** İndirilebilir şablon: başlık satırı + örnek satır. */
export function buildTemplate(definition: ImportDefinition): Blob {
  const sheet = XLSX.utils.aoa_to_sheet([
    definition.fields.map((field) => field.label),
    definition.fields.map((field) => field.example),
  ])
  sheet["!cols"] = definition.fields.map((field) => ({
    wch: Math.max(14, field.label.length + 2),
  }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, definition.label.slice(0, 31))
  const data = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer
  return new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

/** Testler ve örnekler için satırlardan xlsx dosyası üretir. */
export function buildWorkbookFile(
  rows: readonly (readonly (string | number | null)[])[],
  filename = "veri.xlsx"
): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => [...row]))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Sayfa1")
  const data = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer
  return new File([data], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}
