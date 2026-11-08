import {
  actualHeadcount,
  intersectRange,
  plannedDates,
} from "@/features/contracts/domain/headcount"
import { versionSegments } from "@/features/contracts/domain/versions"
import type {
  Contract,
  ContractTemplate,
  HeadcountLocationDetail,
  HeadcountReport,
  HeadcountRow,
} from "@/features/contracts/model/contract"
import {
  calculateProgressPayment,
  type CalculationVersion,
  type WorkedEntry,
} from "@/features/progress-payment/domain/calculate"
import type {
  Calculation,
  ManualPenalty,
} from "@/features/progress-payment/model/progress-payment"
import type { ContractStatus, ContractSummary } from "@/entities/contract"
import type { Position } from "@/entities/personnel"
import { kurus } from "@/shared/lib/money"
import { monthRange } from "@/shared/lib/work-time"

import { db } from "../db"
import type {
  MockContract,
  MockContractTemplate,
  MockContractVersion,
} from "../db/types"
import { holidaysBetween } from "../operations/holidays"
import { collectPersonDays, toWorkedEntries, type PersonDay } from "./worked"
import { MIN_WAGES } from "./min-wage"

export function contractStatus(
  contract: MockContract,
  today: string
): ContractStatus {
  if (contract.terminatedAt && contract.terminatedAt <= today)
    return "terminated"
  if (contract.startDate > today) return "upcoming"
  if (contract.endDate < today) return "expired"
  return "active"
}

const locationName = (id: string) => db.locations.findById(id)?.name ?? id
function orgUnitName(locationId: string): string {
  const location = db.locations.findById(locationId)
  return location
    ? (db.orgUnits.findById(location.orgUnitId)?.name ?? "—")
    : "—"
}

/** Bugün yürürlükte olan (yoksa son) sürüm */
export function currentVersion(
  contract: MockContract,
  today: string
): MockContractVersion {
  return (
    contract.versions.find(
      (version) =>
        version.effectiveFrom <= today && version.effectiveTo >= today
    ) ?? contract.versions.at(-1)!
  )
}

export function serializeContractSummary(
  contract: MockContract,
  today: string
): ContractSummary {
  const version = currentVersion(contract, today)
  return {
    id: contract.id as ContractSummary["id"],
    code: contract.code,
    title: contract.title,
    type: contract.type,
    status: contractStatus(contract, today),
    customerId: contract.customerId,
    customerName: db.customers.findById(contract.customerId)?.name ?? "—",
    contractorLegalEntityId: contract.contractorLegalEntityId,
    contractorTitle:
      db.legalEntities.findById(contract.contractorLegalEntityId)?.title ?? "—",
    startDate: contract.startDate,
    endDate: contract.endDate,
    versionCount: contract.versions.length,
    locationCount: version.locations.filter(
      (location) => location.to === null || location.to >= today
    ).length,
    committedHeadcount: version.commitments.reduce(
      (sum, item) => sum + item.headcount,
      0
    ),
  }
}

export function serializeContract(
  contract: MockContract,
  today: string
): Contract {
  return {
    ...serializeContractSummary(contract, today),
    ikn: contract.ikn,
    templateId: contract.templateId,
    versions: contract.versions.map((version) => ({
      ...version,
      locations: version.locations.map((location) => ({
        ...location,
        locationName: locationName(location.locationId),
        orgUnitName: orgUnitName(location.locationId),
      })),
      prices: {
        unitPrices: version.prices.unitPrices.map((item) => ({
          position: item.position,
          monthly: kurus(item.monthly),
        })),
        overtimeHourly: kurus(version.prices.overtimeHourly),
        materialMonthly: kurus(version.prices.materialMonthly),
      },
      rules: {
        ...version.rules,
        shortfallPenaltyPerPersonDay: kurus(
          version.rules.shortfallPenaltyPerPersonDay
        ),
      },
    })),
  }
}

export function serializeTemplate(
  template: MockContractTemplate
): ContractTemplate {
  const { tenantId: _tenant, ...rest } = template
  return {
    ...rest,
    rules: {
      ...rest.rules,
      shortfallPenaltyPerPersonDay: kurus(
        rest.rules.shortfallPenaltyPerPersonDay
      ),
    },
  }
}

export function fullHolidays(month: string): Set<string> {
  const range = monthRange(month)
  return new Set(
    holidaysBetween(range.from, range.to)
      .filter((holiday) => holiday.kind === "full")
      .map((holiday) => holiday.date)
  )
}

/** Ayda kapsamdaki tüm lokasyonlar */
export function contractLocationIds(
  contract: MockContract,
  month: string
): Set<string> {
  const range = monthRange(month)
  const ids = new Set<string>()
  for (const version of contract.versions) {
    if (version.effectiveTo < range.from || version.effectiveFrom > range.to)
      continue
    for (const location of version.locations) {
      if (intersectRange(location, range)) ids.add(location.locationId)
    }
  }
  return ids
}

export function calculationVersions(
  contract: MockContract
): CalculationVersion[] {
  return serializeContract(contract, contract.startDate).versions.map(
    (version) => ({
      number: version.number,
      effectiveFrom: version.effectiveFrom,
      effectiveTo: version.effectiveTo,
      locations: version.locations,
      commitments: version.commitments,
      prices: version.prices,
      rules: version.rules,
    })
  )
}

export function workedSource(
  contract: MockContract,
  month: string,
  now: Date
): WorkedEntry[] {
  return toWorkedEntries(
    collectPersonDays(
      contract.tenantId,
      monthRange(month),
      contractLocationIds(contract, month),
      now
    )
  )
}

export function calculate(
  contract: MockContract,
  month: string,
  source: readonly WorkedEntry[],
  penalties: readonly ManualPenalty[]
): Calculation {
  return calculateProgressPayment({
    month,
    contractStartDate: contract.startDate,
    versions: calculationVersions(contract),
    worked: source,
    fullHolidays: fullHolidays(month),
    minWages: MIN_WAGES.map((wage) => ({
      effectiveFrom: wage.effectiveFrom,
      grossMonthly: kurus(wage.grossMonthly),
    })),
    penalties,
  })
}

/* ─────────────────────────────── Kadro raporu ─────────────────────────────── */

interface PositionFigure {
  position: Position
  committedPersonDays: number
  plannedDays: number
  workedPersonDays: number
}

/** Sözleşme × lokasyon × pozisyon için taahhüt ve fiili kişi-gün (sürüm dilimleri dahil) */
function locationFigures(
  contract: MockContract,
  month: string,
  days: readonly PersonDay[]
): Map<string, PositionFigure[]> {
  const holidays = fullHolidays(month)
  const worked = new Map<string, number>()
  for (const day of days) {
    const key = `${day.locationId}|${day.position}|${day.date}`
    worked.set(key, (worked.get(key) ?? 0) + day.worked)
  }
  const result = new Map<string, Map<Position, PositionFigure>>()
  for (const segment of versionSegments(contract.versions, month)) {
    for (const commitment of segment.version.commitments) {
      const location = segment.version.locations.find(
        (item) => item.locationId === commitment.locationId
      )
      if (!location) continue
      const scope = intersectRange(location, segment)
      if (!scope) continue
      const dates = plannedDates(commitment.coverage, scope, holidays)
      let positions = result.get(commitment.locationId)
      if (!positions) {
        positions = new Map()
        result.set(commitment.locationId, positions)
      }
      const figure = positions.get(commitment.position) ?? {
        position: commitment.position,
        committedPersonDays: 0,
        plannedDays: 0,
        workedPersonDays: 0,
      }
      figure.committedPersonDays += commitment.headcount * dates.length
      figure.plannedDays += dates.length
      for (const date of dates) {
        figure.workedPersonDays +=
          worked.get(
            `${commitment.locationId}|${commitment.position}|${date}`
          ) ?? 0
      }
      positions.set(commitment.position, figure)
    }
  }
  return new Map(
    [...result].map(([locationId, positions]) => [
      locationId,
      [...positions.values()],
    ])
  )
}

const one = (value: number) => Math.round(value * 10) / 10

export function computeHeadcountReport(
  contracts: readonly MockContract[],
  month: string,
  now: Date,
  locationFilter: (locationId: string) => boolean
): HeadcountReport {
  const rows: HeadcountRow[] = []
  for (const contract of contracts) {
    const locationIds = new Set(
      [...contractLocationIds(contract, month)].filter(locationFilter)
    )
    if (locationIds.size === 0) continue
    const days = collectPersonDays(
      contract.tenantId,
      monthRange(month),
      locationIds,
      now
    )
    const figures = locationFigures(contract, month, days)
    const customerName = db.customers.findById(contract.customerId)?.name ?? "—"
    for (const [locationId, positions] of figures) {
      if (!locationIds.has(locationId)) continue
      const location = db.locations.findById(locationId)
      const plannedDays = positions[0]?.plannedDays ?? 0
      const positionRows = positions.map((figure) => ({
        position: figure.position,
        committed: one(
          figure.plannedDays === 0
            ? 0
            : figure.committedPersonDays / figure.plannedDays
        ),
        actual: actualHeadcount(figure.workedPersonDays, figure.plannedDays),
      }))
      rows.push({
        contractId: contract.id,
        contractCode: contract.code,
        contractTitle: contract.title,
        customerName,
        locationId,
        locationName: location?.name ?? locationId,
        orgUnitId: location?.orgUnitId ?? "",
        orgUnitName: orgUnitName(locationId),
        plannedDays,
        committedPersonDays: positions.reduce(
          (sum, item) => sum + item.committedPersonDays,
          0
        ),
        workedPersonDays: one(
          positions.reduce((sum, item) => sum + item.workedPersonDays, 0)
        ),
        committed: one(
          positionRows.reduce((sum, item) => sum + item.committed, 0)
        ),
        actual: one(positionRows.reduce((sum, item) => sum + item.actual, 0)),
        positions: positionRows,
      })
    }
  }
  rows.sort(
    (a, b) =>
      a.orgUnitName.localeCompare(b.orgUnitName, "tr") ||
      a.locationName.localeCompare(b.locationName, "tr")
  )
  const regions = new Map<
    string,
    {
      orgUnitId: string
      orgUnitName: string
      committed: number
      actual: number
    }
  >()
  for (const row of rows) {
    const region = regions.get(row.orgUnitId) ?? {
      orgUnitId: row.orgUnitId,
      orgUnitName: row.orgUnitName,
      committed: 0,
      actual: 0,
    }
    region.committed = one(region.committed + row.committed)
    region.actual = one(region.actual + row.actual)
    regions.set(row.orgUnitId, region)
  }
  return {
    month,
    totals: {
      committed: one(rows.reduce((sum, row) => sum + row.committed, 0)),
      actual: one(rows.reduce((sum, row) => sum + row.actual, 0)),
    },
    regions: [...regions.values()],
    rows,
  }
}

export function computeLocationDetail(
  contract: MockContract,
  locationId: string,
  month: string,
  now: Date
): HeadcountLocationDetail {
  const days = collectPersonDays(
    contract.tenantId,
    monthRange(month),
    new Set([locationId]),
    now
  )
  const figures = locationFigures(contract, month, days).get(locationId) ?? []
  const holidays = fullHolidays(month)
  const planned = new Set<string>()
  for (const segment of versionSegments(contract.versions, month)) {
    for (const commitment of segment.version.commitments) {
      if (commitment.locationId !== locationId) continue
      const location = segment.version.locations.find(
        (item) => item.locationId === locationId
      )
      const scope = location ? intersectRange(location, segment) : null
      if (!scope) continue
      for (const date of plannedDates(commitment.coverage, scope, holidays))
        planned.add(date)
    }
  }
  const people = new Map<string, PersonDay[]>()
  for (const day of days) {
    if (day.locationId !== locationId) continue
    const list = people.get(day.personnelId)
    if (list) list.push(day)
    else people.set(day.personnelId, [day])
  }
  const personnel = [...people].map(([personnelId, list]) => {
    const person = db.personnel.findById(personnelId)
    const byDate = new Map(list.map((day) => [day.date, day]))
    const missing = [...planned]
      .sort()
      .filter((date) => (byDate.get(date)?.worked ?? 0) < 1)
      .map((date) => ({ date, code: byDate.get(date)?.code ?? null }))
    return {
      personnelId,
      name: person ? `${person.firstName} ${person.lastName}` : personnelId,
      position: list[0]!.position,
      workedDays: list
        .filter((day) => planned.has(day.date))
        .reduce((sum, day) => sum + day.worked, 0),
      missing,
    }
  })
  personnel.sort(
    (a, b) =>
      b.missing.length - a.missing.length || a.name.localeCompare(b.name, "tr")
  )
  return {
    month,
    contractId: contract.id,
    contractTitle: contract.title,
    locationId,
    locationName: locationName(locationId),
    plannedDates: [...planned].sort(),
    committed: one(
      figures.reduce(
        (sum, item) =>
          sum +
          (item.plannedDays === 0
            ? 0
            : item.committedPersonDays / item.plannedDays),
        0
      )
    ),
    actual: one(
      figures.reduce(
        (sum, item) =>
          sum + actualHeadcount(item.workedPersonDays, item.plannedDays),
        0
      )
    ),
    personnel,
  }
}
