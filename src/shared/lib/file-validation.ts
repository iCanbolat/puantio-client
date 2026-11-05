import { formatNumber } from "./format"

export interface FileRejection {
  file: File
  reason: string
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${formatNumber(bytes / 1024, { maximumFractionDigits: 1 })} KB`
  return `${formatNumber(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} MB`
}

/** `accept` listesi (".xlsx,.csv,image/*") ile dosyayı eşleştirir. */
export function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept) return true
  const rules = accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule)
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}

export function validateFiles(
  files: readonly File[],
  options: { accept?: string | undefined; maxSizeBytes?: number | undefined }
): { accepted: File[]; rejected: FileRejection[] } {
  const accepted: File[] = []
  const rejected: FileRejection[] = []
  for (const file of files) {
    if (!matchesAccept(file, options.accept)) {
      rejected.push({ file, reason: "Desteklenmeyen dosya türü" })
    } else if (
      options.maxSizeBytes !== undefined &&
      file.size > options.maxSizeBytes
    ) {
      rejected.push({
        file,
        reason: `Dosya ${formatBytes(options.maxSizeBytes)} sınırını aşıyor`,
      })
    } else {
      accepted.push(file)
    }
  }
  return { accepted, rejected }
}
