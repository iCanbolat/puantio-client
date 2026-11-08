import { workedFraction } from "@/features/contracts/domain/headcount"
import type { WorkedEntry } from "@/features/progress-payment/domain/calculate"
import { computeDayCell } from "@/features/timesheet/domain/cell-code"
import type { CellCode } from "@/features/timesheet/model/cell-code"
import type { Position } from "@/entities/personnel"
import { eachIsoDate } from "@/shared/lib/work-time"

import { db } from "../db"
import type { MockPersonnel, MockShiftAssignment } from "../db/types"
import { holidaysBetween } from "../operations/holidays"
import { assignmentsBetween, visibleEvents } from "../operations/plan"

export interface PersonDay {
  personnelId: string
  position: Position
  date: string
  /** Çalışmanın sayıldığı lokasyon: vardiya ataması (yedek/floater dahil), yoksa ana lokasyon */
  locationId: string
  code: CellCode | null
  worked: number
  overtimeHours: number
}

function employedOn(person: MockPersonnel, date: string): boolean {
  if (person.hireDate > date) return false
  return !person.terminationDate || person.terminationDate >= date
}

/**
 * Lokasyon kümesindeki kişi-günler. Puantajla aynı gün kodu motorunu (`computeDayCell`),
 * onaylı izinleri, resmi tatilleri ve **elle düzeltmeleri** kullanır; tek fark, çalışmanın
 * personelin ana lokasyonuna değil vardiya atamasının lokasyonuna yazılmasıdır.
 */
export function collectPersonDays(
  tenantId: string,
  range: { from: string; to: string },
  locationIds: ReadonlySet<string>,
  now: Date
): PersonDay[] {
  const assignments = assignmentsBetween(
    tenantId,
    range.from,
    range.to,
    (assignment) => locationIds.has(assignment.locationId)
  )
  const byPersonDay = new Map<string, MockShiftAssignment[]>()
  const personIds = new Set<string>()
  for (const assignment of assignments) {
    const key = `${assignment.personnelId}|${assignment.date}`
    const list = byPersonDay.get(key)
    if (list) list.push(assignment)
    else byPersonDay.set(key, [assignment])
    personIds.add(assignment.personnelId)
  }
  const homed = db.personnel.findMany(
    (person) =>
      person.tenantId === tenantId &&
      person.homeLocationId !== null &&
      locationIds.has(person.homeLocationId)
  )
  for (const person of homed) personIds.add(person.id)
  const people = db.personnel.findMany(
    (person) => person.tenantId === tenantId && personIds.has(person.id)
  )
  const holidays = new Map(
    holidaysBetween(range.from, range.to).map((holiday) => [
      holiday.date,
      holiday,
    ])
  )
  const leaves = db.leaves.findMany(
    (leave) =>
      leave.tenantId === tenantId &&
      leave.status === "approved" &&
      personIds.has(leave.personnelId) &&
      leave.startDate <= range.to &&
      leave.endDate >= range.from
  )
  const overrides = new Map(
    db.timesheetOverrides
      .findMany(
        (override) =>
          override.tenantId === tenantId &&
          personIds.has(override.personnelId) &&
          override.date >= range.from &&
          override.date <= range.to
      )
      .map((override) => [`${override.personnelId}|${override.date}`, override])
  )

  const result: PersonDay[] = []
  for (const person of people) {
    const home =
      person.homeLocationId && locationIds.has(person.homeLocationId)
        ? person.homeLocationId
        : null
    for (const date of eachIsoDate(range.from, range.to)) {
      const key = `${person.id}|${date}`
      const shifts = byPersonDay.get(key) ?? []
      const locationId = shifts[0]?.locationId ?? home
      if (!locationId || !employedOn(person, date)) continue
      const holiday = holidays.get(date)
      const leave = leaves.find(
        (item) =>
          item.personnelId === person.id &&
          item.startDate <= date &&
          item.endDate >= date
      )
      const override = overrides.get(key)
      const cell = computeDayCell({
        date,
        now,
        employed: true,
        holiday: holiday ? { kind: holiday.kind } : null,
        leaveType: leave?.type ?? null,
        override: override
          ? {
              code: override.code as CellCode,
              overtimeHours: override.overtimeHours,
            }
          : null,
        shifts: shifts.map((assignment) => {
          const events = visibleEvents(assignment.id, now)
          const checkIn = events.find((event) => event.kind === "in")
          const checkOut = events.filter((event) => event.kind === "out").at(-1)
          return {
            startsAt: new Date(assignment.startsAt),
            endsAt: new Date(assignment.endsAt),
            breakMinutes: assignment.breakMinutes,
            checkIn: checkIn ? new Date(checkIn.deviceTime) : null,
            checkOut: checkOut ? new Date(checkOut.deviceTime) : null,
          }
        }),
      })
      result.push({
        personnelId: person.id,
        position: person.position,
        date,
        locationId,
        code: cell.code,
        worked: workedFraction(cell.code),
        overtimeHours: cell.overtimeHours,
      })
    }
  }
  return result
}

/** Hakediş girdisi: lokasyon × pozisyon × gün toplamları (yalnızca çalışılan günler) */
export function toWorkedEntries(days: readonly PersonDay[]): WorkedEntry[] {
  const map = new Map<string, WorkedEntry>()
  for (const day of days) {
    if (day.worked === 0 && day.overtimeHours === 0) continue
    const key = `${day.locationId}|${day.position}|${day.date}`
    const entry = map.get(key)
    if (entry) {
      entry.personDays += day.worked
      entry.overtimeHours += day.overtimeHours
    } else {
      map.set(key, {
        locationId: day.locationId,
        position: day.position,
        date: day.date,
        personDays: day.worked,
        overtimeHours: day.overtimeHours,
      })
    }
  }
  return [...map.values()]
}
