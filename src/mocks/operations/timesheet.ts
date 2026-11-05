import { availablePeriodActions } from "@/features/timesheet/domain/period"
import {
  computeDayCell,
  summarizeCells,
} from "@/features/timesheet/domain/cell-code"
import type { CellCode } from "@/features/timesheet/model/cell-code"
import type {
  TimesheetPeriod,
  TimesheetRow,
} from "@/features/timesheet/model/timesheet"
import type { Permission } from "@/entities/session"
import {
  addMonths,
  eachIsoDate,
  monthOf,
  monthRange,
} from "@/shared/lib/work-time"

import { db } from "../db"
import type {
  MockLocation,
  MockPersonnel,
  MockShiftAssignment,
  MockTimesheetPeriod,
} from "../db/types"
import type { MockTenant } from "../tenancy/tenants"
import { holidaysBetween } from "./holidays"
import { assignmentsBetween, visibleEvents } from "./plan"
import { ops } from "./store"

export const periodId = (legalEntityId: string, month: string) =>
  `tsp-${legalEntityId}-${month}`

function employedOn(person: MockPersonnel, date: string): boolean {
  if (person.hireDate > date) return false
  return !person.terminationDate || person.terminationDate >= date
}

/** Personel temini hizmetinde çalışan personel varsa dönem müşteri onayı ister */
export function customerApprovalRequired(
  tenantId: string,
  legalEntityId: string
): boolean {
  const staffing = new Set(
    db.locations
      .findMany(
        (location) =>
          location.tenantId === tenantId &&
          location.serviceLines.includes("staffing")
      )
      .map((location) => location.id)
  )
  if (staffing.size === 0) return false
  return (
    db.personnel.count(
      (person) =>
        person.tenantId === tenantId &&
        person.legalEntityId === legalEntityId &&
        person.homeLocationId !== null &&
        staffing.has(person.homeLocationId)
    ) > 0
  )
}

/** Son üç ayın dönemleri her tüzel kişilik için hazırdır (gerçekte İK açar) */
export function ensurePeriods(tenant: MockTenant, now: Date): void {
  const current = monthOf(now)
  const months = [addMonths(current, -2), addMonths(current, -1), current]
  const legalEntities = db.legalEntities.findMany(
    (entity) => entity.tenantId === tenant.slug
  )
  for (const entity of legalEntities) {
    for (const month of months) {
      const id = periodId(entity.id, month)
      if (db.timesheetPeriods.findById(id)) continue
      const status: MockTimesheetPeriod["status"] =
        month < addMonths(current, -1)
          ? "locked"
          : month === current
            ? "open"
            : ops.flags.lockPreviousMonth
              ? "locked"
              : ops.flags.previousMonthStatus
      db.timesheetPeriods.insert({
        id,
        tenantId: tenant.slug,
        legalEntityId: entity.id,
        month,
        status,
        customerApprovalRequired: customerApprovalRequired(
          tenant.slug,
          entity.id
        ),
        history:
          status === "locked"
            ? [
                {
                  at: `${monthRange(addMonths(month, 1)).from}T10:00:00+03:00`,
                  actor: "İK ve bordro",
                  action: "Dönem kilitlendi",
                },
              ]
            : [],
        changes: [],
      })
    }
  }
}

export function periodPersonnel(
  period: MockTimesheetPeriod,
  filter?: (person: MockPersonnel) => boolean
): MockPersonnel[] {
  const range = monthRange(period.month)
  return db.personnel.findMany(
    (person) =>
      person.tenantId === period.tenantId &&
      person.legalEntityId === period.legalEntityId &&
      person.hireDate <= range.to &&
      (!person.terminationDate || person.terminationDate >= range.from) &&
      (!filter || filter(person))
  )
}

export function serializePeriod(
  period: MockTimesheetPeriod,
  permissions: ReadonlySet<Permission>
): TimesheetPeriod {
  const entity = db.legalEntities.findById(period.legalEntityId)
  const personnel = db.personnel.findMany(
    (person) =>
      person.tenantId === period.tenantId &&
      person.legalEntityId === period.legalEntityId &&
      person.status !== "terminated"
  )
  const names = new Map(
    personnel.map((person) => [
      person.id,
      `${person.firstName} ${person.lastName}`,
    ])
  )
  return {
    id: period.id as TimesheetPeriod["id"],
    legalEntityId: period.legalEntityId,
    legalEntityTitle: entity?.title ?? "—",
    month: period.month,
    status: period.status,
    customerApprovalRequired: period.customerApprovalRequired,
    personnelCount: personnel.length,
    history: period.history,
    changes: period.changes.map((change) => ({
      at: change.at,
      actor: change.actor,
      personnelName: names.get(change.personnelId) ?? change.personnelId,
      date: change.date,
      before: change.before as CellCode | null,
      after: change.after as CellCode,
    })),
    availableActions: availablePeriodActions(
      period.status,
      period.customerApprovalRequired,
      permissions
    ),
  }
}

/** Dönemdeki personel satırlarını puantaj kod motoruyla hesaplar */
export function computeRows(
  period: MockTimesheetPeriod,
  people: readonly MockPersonnel[],
  now: Date
): TimesheetRow[] {
  const range = monthRange(period.month)
  const days = eachIsoDate(range.from, range.to)
  const holidays = new Map(
    holidaysBetween(range.from, range.to).map((holiday) => [
      holiday.date,
      holiday,
    ])
  )
  const personIds = new Set(people.map((person) => person.id))
  const byPersonDay = new Map<string, MockShiftAssignment[]>()
  for (const assignment of assignmentsBetween(
    period.tenantId,
    range.from,
    range.to,
    (item) => personIds.has(item.personnelId)
  )) {
    // Yerine yedek atanan vardiya puantajda devamsızlık sayılır (yedek kendi satırında)
    const key = `${assignment.personnelId}|${assignment.date}`
    const list = byPersonDay.get(key)
    if (list) list.push(assignment)
    else byPersonDay.set(key, [assignment])
  }
  const leaves = db.leaves.findMany(
    (leave) =>
      leave.tenantId === period.tenantId &&
      leave.status === "approved" &&
      personIds.has(leave.personnelId) &&
      leave.startDate <= range.to &&
      leave.endDate >= range.from
  )
  const overrides = new Map(
    db.timesheetOverrides
      .findMany((override) => override.periodId === period.id)
      .map((override) => [`${override.personnelId}|${override.date}`, override])
  )
  const locations = new Map<string, MockLocation>(
    db.locations
      .findMany((location) => location.tenantId === period.tenantId)
      .map((location) => [location.id, location])
  )

  return people.map((person) => {
    const cells = days.map((date) => {
      const key = `${person.id}|${date}`
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
        employed: employedOn(person, date),
        holiday: holiday ? { kind: holiday.kind } : null,
        leaveType: leave?.type ?? null,
        override: override
          ? {
              code: override.code as CellCode,
              overtimeHours: override.overtimeHours,
            }
          : null,
        shifts: (byPersonDay.get(key) ?? []).map((assignment) => {
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
      return { date, ...cell, overridden: override !== undefined }
    })
    const location = person.homeLocationId
      ? locations.get(person.homeLocationId)
      : undefined
    return {
      personnelId: person.id,
      name: `${person.firstName} ${person.lastName}`,
      employeeNumber: person.employeeNumber,
      locationName:
        location?.name ?? (person.isFloater ? "Yedek havuzu" : null),
      cells: cells.map(({ workedHours: _worked, ...cell }) => cell),
      summary: summarizeCells(cells),
    }
  })
}
