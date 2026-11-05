/** Tarayıcıda dosya indirmeyi tetikler. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Safari indirmeyi başlatmadan URL iptal edilmesin diye bir tur bekle
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

/**
 * `Content-Disposition` başlığından dosya adını çıkarır.
 * RFC 5987 `filename*=UTF-8''...` biçimi önceliklidir (Türkçe karakterler için).
 */
export function parseContentDispositionFilename(
  header: string | null
): string | null {
  if (!header) return null
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header)
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim())
    } catch {
      return extended[1].trim()
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header)
  return plain?.[1]?.trim() ?? null
}

export interface CsvOptions {
  /** Türkçe Excel ondalık ayırıcı olarak virgül kullandığı için varsayılan ";" */
  delimiter?: string
}

function escapeCsvCell(value: string, delimiter: string): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  const escaped = value.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

export function toCsv(
  rows: readonly (readonly (string | number | null | undefined)[])[],
  options: CsvOptions = {}
): string {
  const delimiter = options.delimiter ?? ";"
  return rows
    .map((row) =>
      row
        .map((cell) =>
          escapeCsvCell(cell == null ? "" : String(cell), delimiter)
        )
        .join(delimiter)
    )
    .join("\r\n")
}

/** Excel'in UTF-8'i tanıması için BOM eklenmiş CSV blob'u. */
export function csvBlob(csv: string): Blob {
  return new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" })
}
