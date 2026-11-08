import { addDaysIso, monthRange } from "@/shared/lib/work-time"

import type { ContractVersion } from "../model/contract"

type VersionRange = Pick<
  ContractVersion,
  "id" | "number" | "effectiveFrom" | "effectiveTo"
>

/** Verilen tarihte yürürlükte olan sürüm (yoksa `null`). */
export function versionAt<T extends VersionRange>(
  versions: readonly T[],
  date: string
): T | null {
  return (
    versions.find(
      (version) => version.effectiveFrom <= date && version.effectiveTo >= date
    ) ?? null
  )
}

export interface VersionSegment<T> {
  version: T
  from: string
  to: string
}

/**
 * Sürümlerin bir ay içindeki dilimleri (kıst hesabı için). Sözleşme dışı günler dilime girmez.
 * Ör. 15'inde yürürlüğe giren zeyilname: [1–14: sürüm 0], [15–30: sürüm 1].
 */
export function versionSegments<T extends VersionRange>(
  versions: readonly T[],
  month: string
): VersionSegment<T>[] {
  const range = monthRange(month)
  return [...versions]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .flatMap((version) => {
      const from =
        version.effectiveFrom > range.from ? version.effectiveFrom : range.from
      const to = version.effectiveTo < range.to ? version.effectiveTo : range.to
      return from <= to ? [{ version, from, to }] : []
    })
}

export type AddendumCheck =
  | { ok: true; closes: string; closesAt: string }
  | {
      ok: false
      code: "VERSION_OVERLAP" | "OUT_OF_CONTRACT"
      message: string
    }

/**
 * Zeyilname yürürlük kontrolü. Yeni sürüm son sürümden **sonra** başlamalı ve sözleşme
 * süresi içinde olmalıdır; son sürüm yeni sürümden bir gün önce kapanır. Aynı güne veya
 * önceki bir sürümün içine düşen yürürlük tarihi iki sürümün çakışması demektir (TC-3.1-02).
 */
export function checkAddendum(
  contract: { startDate: string; endDate: string },
  versions: readonly VersionRange[],
  effectiveFrom: string
): AddendumCheck {
  if (effectiveFrom < contract.startDate || effectiveFrom > contract.endDate) {
    return {
      ok: false,
      code: "OUT_OF_CONTRACT",
      message: "Yürürlük tarihi sözleşme süresi içinde olmalı.",
    }
  }
  const last = [...versions].sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom)
  )[0]
  if (!last) {
    return { ok: true, closes: "", closesAt: addDaysIso(effectiveFrom, -1) }
  }
  if (effectiveFrom <= last.effectiveFrom) {
    const conflict = versionAt(versions, effectiveFrom) ?? last
    return {
      ok: false,
      code: "VERSION_OVERLAP",
      message: `${versionLabel(conflict.number)} ile yürürlük tarihi çakışıyor (${conflict.effectiveFrom} başlangıçlı). Yeni sürüm son sürümden sonra başlamalı.`,
    }
  }
  return { ok: true, closes: last.id, closesAt: addDaysIso(effectiveFrom, -1) }
}

export function versionLabel(number: number): string {
  return number === 0 ? "Asıl sözleşme" : `${number} no'lu zeyilname`
}

/** Tarih aralıkları kesişiyor mu (uçlar dahil; `null` açık uç) */
export function rangesOverlap(
  a: { from: string; to: string | null },
  b: { from: string; to: string | null }
): boolean {
  return (a.to === null || a.to >= b.from) && (b.to === null || b.to >= a.from)
}
