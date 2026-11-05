import { detectAnomalies } from "@/features/attendance/domain/anomalies"
import {
  alarmCreatedAt,
  alarmDueAt,
  deriveAttendanceStatus,
  lateMinutes,
  shouldEscalate,
} from "@/features/attendance/domain/status"
import type {
  Alarm,
  AttendanceEvent,
  LiveShift,
} from "@/features/attendance/model/attendance"
import { toIsoDate } from "@/shared/lib/date"
import { HOUR_MS, addDaysIso } from "@/shared/lib/work-time"

import { mockClock } from "../clock"
import { db, newId } from "../db"
import type {
  MockAlarm,
  MockAttendanceEvent,
  MockLocation,
  MockPersonnel,
  MockShiftAssignment,
} from "../db/types"
import { apiPath } from "../http"
import { broadcastEvent } from "../realtime"
import type { MockTenant } from "../tenancy/tenants"
import { approvedLeaveOn, assignmentsBetween, visibleEvents } from "./plan"
import { ops, tenantDays } from "./store"

export function locationRules(tenant: MockTenant, locationId: string) {
  const override = db.locationRules.findById(locationId)
  return {
    toleranceMinutes:
      override?.lateToleranceMinutes ?? tenant.rules.lateToleranceMinutes,
    slaMinutes: override?.alarmSlaMinutes ?? tenant.rules.alarmSlaMinutes,
    escalationMinutes: tenant.rules.escalationMinutes,
  }
}

/** Yedek ataması: `replacesShiftId` ile bağlı vardiya */
export function backupFor(
  assignment: MockShiftAssignment
): MockShiftAssignment | null {
  const list = tenantDays(assignment.tenantId).get(assignment.date) ?? []
  return list.find((item) => item.replacesShiftId === assignment.id) ?? null
}

export function serializeEvent(event: MockAttendanceEvent): AttendanceEvent {
  const expires = mockClock.now().getTime() + 5 * 60_000
  return {
    id: event.id,
    kind: event.kind,
    method: event.method,
    deviceTime: event.deviceTime,
    receivedAt: event.receivedAt,
    offline: event.offline,
    geofence: { inside: event.inside, distanceMeters: event.distanceMeters },
    // İmzalı, 5 dk geçerli adres (gerçekte nesne deposu ön imzalı URL)
    photoUrl: event.hasPhoto
      ? `${apiPath(`/files/checkin-photos/${encodeURIComponent(event.id)}`)}?exp=${expires}&sig=${event.id.length.toString(16)}${String(expires).slice(-6)}`
      : null,
    corrected: event.corrected,
  }
}

export interface ShiftSnapshot {
  events: MockAttendanceEvent[]
  checkIn: MockAttendanceEvent | null
  checkOut: MockAttendanceEvent | null
  status: LiveShift["status"]
  lateMinutes: number
  anomalies: LiveShift["anomalies"]
  hasBackup: boolean
}

export function snapshotShift(
  tenant: MockTenant,
  assignment: MockShiftAssignment,
  now: Date
): ShiftSnapshot {
  const events = visibleEvents(assignment.id, now)
  const checkIn = events.find((event) => event.kind === "in") ?? null
  const checkOut = events.find((event) => event.kind === "out") ?? null
  const rules = locationRules(tenant, assignment.locationId)
  const hasBackup = backupFor(assignment) !== null
  const startsAt = new Date(assignment.startsAt)
  const checkInAt = checkIn ? new Date(checkIn.deviceTime) : null
  const status = deriveAttendanceStatus({
    startsAt,
    endsAt: new Date(assignment.endsAt),
    checkIn: checkInAt,
    checkOut: checkOut ? new Date(checkOut.deviceTime) : null,
    hasBackup,
    now,
    toleranceMinutes: rules.toleranceMinutes,
  })
  return {
    events,
    checkIn,
    checkOut,
    hasBackup,
    // Yedek görevli sonradan atanır: yolda olduğu için "Gelmedi" sayılmaz, beklenir
    status:
      assignment.kind === "backup" && status === "no_show"
        ? "expected"
        : status,
    lateMinutes: lateMinutes(startsAt, checkInAt),
    anomalies: detectAnomalies({
      endsAt: new Date(assignment.endsAt),
      now,
      events: events.map((event) => ({
        kind: event.kind,
        deviceTime: new Date(event.deviceTime),
        receivedAt: new Date(event.receivedAt),
        offline: event.offline,
        inside: event.inside,
        distanceMeters: event.distanceMeters,
      })),
    }),
  }
}

export const personName = (
  person: Pick<MockPersonnel, "firstName" | "lastName">
) => `${person.firstName} ${person.lastName}`

export interface Lookups {
  personnel: Map<string, MockPersonnel>
  locations: Map<string, MockLocation>
  orgUnitNames: Map<string, string>
}

export function buildLookups(tenantId: string): Lookups {
  return {
    personnel: new Map(
      db.personnel
        .findMany((person) => person.tenantId === tenantId)
        .map((person) => [person.id, person])
    ),
    locations: new Map(
      db.locations
        .findMany((location) => location.tenantId === tenantId)
        .map((location) => [location.id, location])
    ),
    orgUnitNames: new Map(
      db.orgUnits
        .findMany((unit) => unit.tenantId === tenantId)
        .map((unit) => [unit.id, unit.name])
    ),
  }
}

export function serializeLiveShift(
  tenant: MockTenant,
  assignment: MockShiftAssignment,
  lookups: Lookups,
  now: Date
): LiveShift {
  const snapshot = snapshotShift(tenant, assignment, now)
  const person = lookups.personnel.get(assignment.personnelId)
  const location = lookups.locations.get(assignment.locationId)
  const alarm = db.alarms.findFirst((item) => item.shiftId === assignment.id)
  return {
    shiftId: assignment.id,
    personnelId: assignment.personnelId,
    personnelName: person ? personName(person) : "—",
    employeeNumber: person?.employeeNumber ?? "—",
    locationId: assignment.locationId,
    locationName: location?.name ?? "—",
    orgUnitName: location
      ? (lookups.orgUnitNames.get(location.orgUnitId) ?? null)
      : null,
    code: assignment.code,
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
    isBackup: assignment.kind === "backup",
    status: snapshot.status,
    lateMinutes: snapshot.lateMinutes,
    checkIn: snapshot.checkIn ? serializeEvent(snapshot.checkIn) : null,
    checkOut: snapshot.checkOut ? serializeEvent(snapshot.checkOut) : null,
    anomalies: snapshot.anomalies,
    alarmId: alarm?.id ?? null,
  }
}

/** Bugünün ve dünden taşan (gece) vardiyaları */
export function liveAssignments(
  tenantId: string,
  now: Date,
  filter?: (assignment: MockShiftAssignment) => boolean
): MockShiftAssignment[] {
  const today = toIsoDate(now)
  const nowMs = now.getTime()
  return assignmentsBetween(
    tenantId,
    addDaysIso(today, -1),
    today,
    (assignment) =>
      (assignment.date === today || Date.parse(assignment.endsAt) > nowMs) &&
      (!filter || filter(assignment))
  )
}

export function serializeAlarm(
  alarm: MockAlarm,
  lookups: Lookups,
  options: { includePhone: boolean; tenant: MockTenant }
): Alarm {
  const person = lookups.personnel.get(alarm.personnelId)
  const location = lookups.locations.get(alarm.locationId)
  const shift = ops.byId.get(alarm.shiftId)
  const backup = alarm.resolution?.backupPersonnelId
    ? lookups.personnel.get(alarm.resolution.backupPersonnelId)
    : undefined
  return {
    id: alarm.id as Alarm["id"],
    shiftId: alarm.shiftId,
    personnelId: alarm.personnelId,
    personnelName: person ? personName(person) : "—",
    personnelPhone: options.includePhone ? (person?.phone ?? null) : null,
    locationId: alarm.locationId,
    locationName: location?.name ?? "—",
    orgUnitName: location
      ? (lookups.orgUnitNames.get(location.orgUnitId) ?? null)
      : null,
    shiftStartsAt: shift?.startsAt ?? alarm.createdAt,
    createdAt: alarm.createdAt,
    dueAt: alarm.dueAt,
    status: alarm.status,
    escalatedAt: alarm.escalatedAt,
    escalatedTo: alarm.escalatedAt ? "Operasyon müdürü" : null,
    resolvedAt: alarm.resolvedAt,
    resolvedBy: alarm.resolvedBy,
    resolution: alarm.resolution
      ? {
          reason: alarm.resolution.reason,
          note: alarm.resolution.note,
          backupPersonnelName: backup ? personName(backup) : null,
        }
      : null,
    notes: alarm.notes,
  }
}

function emit(type: string, tenantId: string, alarmId: string) {
  broadcastEvent(type, { tenantId, alarmId })
}

export function resolveAlarm(
  alarm: MockAlarm,
  resolution: NonNullable<MockAlarm["resolution"]>,
  by: string,
  at: Date
): MockAlarm {
  const updated = db.alarms.update(alarm.id, {
    status: "resolved",
    resolvedAt: at.toISOString(),
    resolvedBy: by,
    resolution,
  })!
  emit("alarm.resolved", alarm.tenantId, alarm.id)
  return updated
}

/**
 * Gelmeyen personel alarmlarını değerlendirir (gerçekte backend zamanlayıcısı):
 * - Başlangıç + tolerans geçmiş, girişi olmayan, yedeği/izni olmayan vardiyaya alarm açar.
 * - Giriş sonradan ulaştıysa alarmı "Geç geldi" ile kapatır.
 * - Eskalasyon süresini dolduran alarmı operasyon müdürüne eskale eder.
 */
export function evaluateAlarms(
  tenant: MockTenant,
  now: Date = mockClock.now()
): void {
  const nowMs = now.getTime()
  const tenantId = tenant.slug
  const candidates = liveAssignments(
    tenantId,
    now,
    (assignment) =>
      assignment.kind === "regular" &&
      Date.parse(assignment.startsAt) <= nowMs &&
      Date.parse(assignment.startsAt) > nowMs - 16 * HOUR_MS
  )
  const existing = new Map(
    db.alarms
      .findMany((alarm) => alarm.tenantId === tenantId)
      .map((alarm) => [alarm.shiftId, alarm])
  )
  for (const assignment of candidates) {
    const rules = locationRules(tenant, assignment.locationId)
    const startsAt = new Date(assignment.startsAt)
    const created = alarmCreatedAt(startsAt, rules.toleranceMinutes)
    if (created.getTime() > nowMs) continue
    const alarm = existing.get(assignment.id)
    const checkIn = visibleEvents(assignment.id, now).find(
      (event) => event.kind === "in"
    )
    if (!alarm) {
      if (checkIn || backupFor(assignment)) continue
      if (approvedLeaveOn(tenantId, assignment.personnelId, assignment.date))
        continue
      const inserted = db.alarms.insert({
        id: newId("alm"),
        tenantId,
        shiftId: assignment.id,
        personnelId: assignment.personnelId,
        locationId: assignment.locationId,
        createdAt: created.toISOString(),
        dueAt: alarmDueAt(created, rules.slaMinutes).toISOString(),
        status: "open",
        escalatedAt: null,
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
        notes: [],
      })
      existing.set(assignment.id, inserted)
      emit("alarm.created", tenantId, inserted.id)
    } else if (alarm.status !== "resolved" && checkIn) {
      resolveAlarm(
        alarm,
        {
          reason: "late_arrival",
          note: checkIn.offline
            ? "Giriş kaydı geç senkronize oldu (çevrimdışı)."
            : "Personel geç giriş yaptı.",
          backupPersonnelId: null,
        },
        "Sistem",
        now
      )
    }
  }

  for (const alarm of db.alarms.findMany(
    (item) => item.tenantId === tenantId && item.status === "open"
  )) {
    if (!ops.byId.has(alarm.shiftId)) {
      resolveAlarm(
        alarm,
        { reason: "shift_cancelled", note: null, backupPersonnelId: null },
        "Sistem",
        now
      )
      continue
    }
    if (
      shouldEscalate(
        new Date(alarm.createdAt),
        now,
        tenant.rules.escalationMinutes
      )
    ) {
      const escalatedAt = new Date(
        Date.parse(alarm.createdAt) + tenant.rules.escalationMinutes * 60_000
      )
      db.alarms.update(alarm.id, {
        status: "escalated",
        escalatedAt: escalatedAt.toISOString(),
      })
      emit("alarm.updated", tenantId, alarm.id)
    }
  }
}
