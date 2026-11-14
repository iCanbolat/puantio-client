import { addMonthsIso } from "@/entities/ohs"

import type { DocumentState } from "../model/personnel-file"

export interface DocumentTypeRule {
  id: string
  name: string
  required: boolean
  validityMonths: number | null
  isActive: boolean
}

export interface StoredVersion {
  issuedAt: string | null
  uploadedAt: string
}

/**
 * Belge durumu: yoksa eksik; geçerlilik süresi olan belge (adli sicil 6 ay gibi) düzenlenme
 * tarihinden itibaren süre dolunca "süresi geçmiş" sayılır ve tamamlanmaya katkı vermez.
 */
export function documentState(
  type: Pick<DocumentTypeRule, "validityMonths">,
  latest: StoredVersion | undefined,
  today: string
): { state: DocumentState; validUntil: string | null } {
  if (!latest) return { state: "missing", validUntil: null }
  if (type.validityMonths === null)
    return { state: "present", validUntil: null }
  const base = latest.issuedAt ?? latest.uploadedAt.slice(0, 10)
  const validUntil = addMonthsIso(base, type.validityMonths)
  return {
    state: validUntil < today ? "expired" : "present",
    validUntil,
  }
}

/** Tamamlanma yüzdesi yalnızca zorunlu ve etkin belge türleri üzerinden hesaplanır */
export function completionOf(
  types: readonly DocumentTypeRule[],
  latestByType: ReadonlyMap<string, StoredVersion>,
  today: string
): {
  completion: number
  missing: string[]
  expired: string[]
} {
  const required = types.filter((type) => type.isActive && type.required)
  const missing: string[] = []
  const expired: string[] = []
  let done = 0
  for (const type of required) {
    const { state } = documentState(type, latestByType.get(type.id), today)
    if (state === "present") done += 1
    else if (state === "missing") missing.push(type.name)
    else expired.push(type.name)
  }
  return {
    completion: required.length
      ? Math.floor((done / required.length) * 100)
      : 100,
    missing,
    expired,
  }
}
