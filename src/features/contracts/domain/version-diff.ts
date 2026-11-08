import { POSITION_LABELS, type Position } from "@/entities/personnel"
import { SERVICE_LINE_LABELS } from "@/entities/tenant"
import { formatMoney } from "@/shared/lib/format"
import type { Kurus } from "@/shared/lib/money"

import type { ContractVersion } from "../model/contract"

export type DiffKind = "added" | "removed" | "changed"

export interface VersionDiffItem {
  section: "Kapsam" | "Lokasyon" | "Kadro" | "Fiyat" | "Kural"
  kind: DiffKind
  label: string
  before: string | null
  after: string | null
}

type Comparable = Pick<
  ContractVersion,
  "serviceLines" | "locations" | "commitments" | "prices" | "rules"
>

const money = (value: Kurus) => formatMoney(value)

/** İki sürüm arasındaki alan bazlı farklar (sürüm karşılaştırma ekranı). */
export function diffVersions(
  before: Comparable,
  after: Comparable
): VersionDiffItem[] {
  const items: VersionDiffItem[] = []

  const lines = new Set([...before.serviceLines, ...after.serviceLines])
  for (const line of lines) {
    const had = before.serviceLines.includes(line)
    const has = after.serviceLines.includes(line)
    if (had !== has)
      items.push({
        section: "Kapsam",
        kind: has ? "added" : "removed",
        label: SERVICE_LINE_LABELS[line],
        before: had ? "Var" : null,
        after: has ? "Var" : null,
      })
  }

  const scope = (location: { from: string; to: string | null }) =>
    location.to ? `${location.from} – ${location.to}` : `${location.from} –`
  const beforeLocations = new Map(
    before.locations.map((item) => [item.locationId, item])
  )
  const afterLocations = new Map(
    after.locations.map((item) => [item.locationId, item])
  )
  for (const [id, item] of afterLocations) {
    const old = beforeLocations.get(id)
    if (!old)
      items.push({
        section: "Lokasyon",
        kind: "added",
        label: item.locationName,
        before: null,
        after: scope(item),
      })
    else if (old.to !== item.to || old.from !== item.from)
      items.push({
        section: "Lokasyon",
        kind: "changed",
        label: item.locationName,
        before: scope(old),
        after: scope(item),
      })
  }
  for (const [id, item] of beforeLocations) {
    if (!afterLocations.has(id))
      items.push({
        section: "Lokasyon",
        kind: "removed",
        label: item.locationName,
        before: scope(item),
        after: null,
      })
  }

  const names = new Map(
    [...before.locations, ...after.locations].map((item) => [
      item.locationId,
      item.locationName,
    ])
  )
  const key = (item: { locationId: string; position: Position }) =>
    `${item.locationId}|${item.position}`
  const beforeCommitments = new Map(
    before.commitments.map((item) => [key(item), item])
  )
  const afterCommitments = new Map(
    after.commitments.map((item) => [key(item), item])
  )
  for (const id of new Set([
    ...beforeCommitments.keys(),
    ...afterCommitments.keys(),
  ])) {
    const old = beforeCommitments.get(id)
    const next = afterCommitments.get(id)
    const sample = next ?? old
    if (!sample) continue
    const label = `${names.get(sample.locationId) ?? sample.locationId} · ${POSITION_LABELS[sample.position]}`
    if (old?.headcount === next?.headcount && old?.coverage === next?.coverage)
      continue
    items.push({
      section: "Kadro",
      kind: !old ? "added" : !next ? "removed" : "changed",
      label,
      before: old ? `${old.headcount} kişi` : null,
      after: next ? `${next.headcount} kişi` : null,
    })
  }

  const beforePrices = new Map(
    before.prices.unitPrices.map((item) => [item.position, item.monthly])
  )
  const afterPrices = new Map(
    after.prices.unitPrices.map((item) => [item.position, item.monthly])
  )
  for (const position of new Set([
    ...beforePrices.keys(),
    ...afterPrices.keys(),
  ])) {
    const old = beforePrices.get(position)
    const next = afterPrices.get(position)
    if (old === next) continue
    const change = old && next ? ` (${formatChange(next / old - 1)})` : ""
    items.push({
      section: "Fiyat",
      kind:
        old === undefined
          ? "added"
          : next === undefined
            ? "removed"
            : "changed",
      label: `${POSITION_LABELS[position]} · kişi/ay`,
      before: old === undefined ? null : money(old),
      after: next === undefined ? null : `${money(next)}${change}`,
    })
  }
  const scalar = (label: string, a: Kurus, b: Kurus) => {
    if (a !== b)
      items.push({
        section: "Fiyat",
        kind: "changed",
        label,
        before: money(a),
        after: money(b),
      })
  }
  scalar(
    "Fazla mesai saat ücreti",
    before.prices.overtimeHourly,
    after.prices.overtimeHourly
  )
  scalar(
    "Aylık malzeme bedeli",
    before.prices.materialMonthly,
    after.prices.materialMonthly
  )

  const rule = (label: string, a: string, b: string) => {
    if (a !== b)
      items.push({
        section: "Kural",
        kind: "changed",
        label,
        before: a,
        after: b,
      })
  }
  rule(
    "Eksik personel kesintisi",
    `%${before.rules.shortfallDeductionPercent}`,
    `%${after.rules.shortfallDeductionPercent}`
  )
  rule("KDV oranı", `%${before.rules.vatRate}`, `%${after.rules.vatRate}`)
  rule(
    "Fiyat farkı",
    before.rules.priceAdjustment.kind,
    after.rules.priceAdjustment.kind
  )
  return items
}

function formatChange(ratio: number): string {
  const formatted = new Intl.NumberFormat("tr-TR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(Math.abs(ratio))
  return `${ratio >= 0 ? "+" : "−"}${formatted}`
}
