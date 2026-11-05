import {
  MINUTE_MS,
  addDaysIso,
  diffIsoDays,
  eachIsoDate,
  isoWeekday,
  segmentInterval,
  startOfIsoWeek,
} from "@/shared/lib/work-time"

import { db } from "../db"
import type {
  MockAttendanceEvent,
  MockLeave,
  MockLocation,
  MockPersonnel,
  MockShiftAssignment,
  MockShiftTemplate,
} from "../db/types"
import { pick, rand, randInt } from "./hash"
import { holidayOn } from "./holidays"
import { addAssignment, ops } from "./store"

/** Rotasyon başlangıcı (pazartesi) */
const ROTATION_EPOCH = "2026-01-05"

const iso = (ms: number) => new Date(ms).toISOString()

export function tenantTemplates(
  tenantId: string
): Map<string, MockShiftTemplate> {
  return new Map(
    db.shiftTemplates
      .findMany((template) => template.tenantId === tenantId)
      .map((template) => [template.id, template])
  )
}

/** Planlanmış (taslak dışı) her vardiya için personelin özel durumu var mı */
function isScenarioPerson(personnelId: string): boolean {
  const flags = ops.flags
  return (
    flags.noShowPersonnelIds.has(personnelId) ||
    flags.offlineBurstPersonnelIds.has(personnelId) ||
    flags.geofenceViolations.has(personnelId)
  )
}

function employedOn(person: MockPersonnel, date: string): boolean {
  if (person.hireDate > date) return false
  if (person.terminationDate && person.terminationDate < date) return false
  return person.status !== "passive"
}

/* ─────────────────────────────── İzinler ─────────────────────────────── */

const LEAVE_PLAN: {
  weight: number
  type: MockLeave["type"]
  min: number
  max: number
}[] = [
  { weight: 60, type: "annual", min: 1, max: 5 },
  { weight: 25, type: "sick_report", min: 1, max: 3 },
  { weight: 10, type: "excuse", min: 1, max: 1 },
  { weight: 5, type: "unpaid", min: 1, max: 2 },
]

function pickLeavePlan(key: string) {
  let roll = rand(key) * 100
  for (const plan of LEAVE_PLAN) {
    if (roll < plan.weight) return plan
    roll -= plan.weight
  }
  return LEAVE_PLAN[0]!
}

/** İş günü sayısı: pazar ve resmi tatiller hariç (arefe yarım gün) */
export function countLeaveDays(startDate: string, endDate: string): number {
  let total = 0
  for (const date of eachIsoDate(startDate, endDate)) {
    if (isoWeekday(date) === 7) continue
    const holiday = holidayOn(date)
    if (holiday?.kind === "full") continue
    total += holiday?.kind === "half" ? 0.5 : 1
  }
  return total
}

function ensureLeaveWeek(tenantId: string, weekStart: string): void {
  let weeks = ops.leaveWeeks.get(tenantId)
  if (!weeks) {
    weeks = new Set()
    ops.leaveWeeks.set(tenantId, weeks)
  }
  if (weeks.has(weekStart)) return
  weeks.add(weekStart)
  const people = db.personnel.findMany(
    (person) =>
      person.tenantId === tenantId &&
      person.status === "active" &&
      !person.isFloater
  )
  for (const person of people) {
    if (isScenarioPerson(person.id)) continue
    const key = `${person.id}:leave:${weekStart}`
    if (rand(key) >= 0.02) continue
    const plan = pickLeavePlan(`${key}:type`)
    const startDate = addDaysIso(weekStart, randInt(`${key}:day`, 0, 4))
    const endDate = addDaysIso(
      startDate,
      randInt(`${key}:len`, plan.min, plan.max) - 1
    )
    if (!employedOn(person, startDate)) continue
    const id = `lv-${person.id}-${weekStart}`
    if (db.leaves.findById(id)) continue
    db.leaves.insert({
      id,
      tenantId,
      personnelId: person.id,
      type: plan.type,
      startDate,
      endDate,
      days: countLeaveDays(startDate, endDate),
      status: "approved",
      note: plan.type === "sick_report" ? null : null,
      requestedAt: `${addDaysIso(startDate, plan.type === "sick_report" ? 0 : -7)}T10:00:00+03:00`,
      requestedBy: "Bölge sorumlusu",
      decidedAt: `${addDaysIso(startDate, plan.type === "sick_report" ? 0 : -6)}T09:00:00+03:00`,
      decidedBy: "Bölge sorumlusu",
      decisionNote: null,
    })
  }
}

export function ensureLeaves(tenantId: string, from: string, to: string): void {
  for (
    let week = startOfIsoWeek(from);
    week <= to;
    week = addDaysIso(week, 7)
  ) {
    ensureLeaveWeek(tenantId, week)
  }
}

/** Onay bekleyen birkaç izin talebi (izin sayfası demosu) */
export function ensurePendingLeaves(tenantId: string, today: string): void {
  if (ops.pendingLeavesSeeded.has(tenantId)) return
  ops.pendingLeavesSeeded.add(tenantId)
  const people = db.personnel
    .findMany(
      (person) =>
        person.tenantId === tenantId &&
        person.status === "active" &&
        !person.isFloater &&
        !isScenarioPerson(person.id)
    )
    .slice(0, 60)
  for (let index = 0; index < 4 && people.length > 0; index += 1) {
    const person = pick(`${tenantId}:pending:${index}`, people)
    const startDate = addDaysIso(today, 3 + index * 4)
    const type = index % 2 === 0 ? "annual" : "excuse"
    const endDate = addDaysIso(startDate, type === "annual" ? 2 : 0)
    db.leaves.insert({
      id: `lv-pending-${tenantId}-${index}`,
      tenantId,
      personnelId: person.id,
      type,
      startDate,
      endDate,
      days: countLeaveDays(startDate, endDate),
      status: "pending",
      note: type === "excuse" ? "Aile ziyareti" : null,
      requestedAt: `${addDaysIso(today, -1)}T09:30:00+03:00`,
      requestedBy: "Saha süpervizörü",
      decidedAt: null,
      decidedBy: null,
      decisionNote: null,
    })
  }
}

export function approvedLeaveOn(
  tenantId: string,
  personnelId: string,
  date: string
): MockLeave | null {
  return (
    db.leaves.findFirst(
      (leave) =>
        leave.tenantId === tenantId &&
        leave.personnelId === personnelId &&
        leave.status === "approved" &&
        leave.startDate <= date &&
        leave.endDate >= date
    ) ?? null
  )
}

/* ─────────────────────────────── Vardiyalar ─────────────────────────────── */

function templateFor(
  tenantId: string,
  person: MockPersonnel,
  date: string,
  templates: Map<string, MockShiftTemplate>
): MockShiftTemplate | null {
  const id = (key: string) => `tpl-${tenantId}-${key}`
  if (isScenarioPerson(person.id)) return templates.get(id("sabah")) ?? null
  const holiday = holidayOn(date)
  if (tenantId === "guvenlik") {
    const offset = randInt(`${person.id}:rot`, 0, 5)
    const step = (((diffIsoDays(ROTATION_EPOCH, date) + offset) % 6) + 6) % 6
    if (step >= 4) return null
    return templates.get(id(step < 2 ? "gunduz12" : "gece12")) ?? null
  }
  if (holiday?.kind === "full" || isoWeekday(date) === 7) return null
  const roll = rand(`${person.id}:tpl`)
  const key =
    roll < 0.7
      ? "sabah"
      : roll < 0.9
        ? "aksam"
        : roll < 0.95
          ? "gece"
          : "parcali"
  return templates.get(id(key)) ?? null
}

/** Şablondan atama (parçalı vardiyada ilk ve son parça arası tek aralık) */
export function buildAssignment(input: {
  id: string
  tenantId: string
  personnelId: string
  locationId: string
  date: string
  template: MockShiftTemplate
  kind?: MockShiftAssignment["kind"]
  replacesShiftId?: string | null
}): MockShiftAssignment {
  const segments = input.template.segments
  const first = segmentInterval(input.date, segments[0]!)
  const last = segmentInterval(input.date, segments[segments.length - 1]!)
  const gapMinutes =
    segments.length > 1
      ? Math.round((last.start.getTime() - first.end.getTime()) / MINUTE_MS)
      : 0
  return {
    id: input.id,
    tenantId: input.tenantId,
    personnelId: input.personnelId,
    locationId: input.locationId,
    date: input.date,
    templateId: input.template.id,
    code: input.template.code,
    startsAt: first.start.toISOString(),
    endsAt: last.end.toISOString(),
    breakMinutes: input.template.breakMinutes + gapMinutes,
    kind: input.kind ?? "regular",
    replacesShiftId: input.replacesShiftId ?? null,
  }
}

function generateEvents(
  assignment: MockShiftAssignment,
  location: MockLocation | undefined
): MockAttendanceEvent[] {
  const flags = ops.flags
  const key = assignment.id
  const personId = assignment.personnelId
  if (flags.noShowPersonnelIds.has(personId)) return []
  const noise = flags.noise && !isScenarioPerson(personId)
  const roll = rand(`${key}:r`)
  if (noise && roll < 0.03) return []

  const start = Date.parse(assignment.startsAt)
  const end = Date.parse(assignment.endsAt)
  const radius = location?.geofence.radiusMeters ?? 100
  const lateBy =
    noise && roll < 0.1
      ? randInt(`${key}:late`, 12, 45)
      : randInt(`${key}:early`, -12, 3)
  const actualIn = start + lateBy * MINUTE_MS

  const base = {
    tenantId: assignment.tenantId,
    shiftId: assignment.id,
    personnelId: personId,
    hasPhoto: true,
    corrected: false,
  }
  const methodRoll = rand(`${key}:method`)
  const method: MockAttendanceEvent["method"] =
    methodRoll < 0.7 ? "qr" : methodRoll < 0.95 ? "nfc" : "manual"

  let offline = false
  let receivedIn = actualIn + randInt(`${key}:lag`, 1, 20) * 1000
  if (flags.offlineBurstPersonnelIds.has(personId)) {
    offline = true
    receivedIn = actualIn + randInt(`${key}:burst`, 200, 230) * MINUTE_MS
  } else if (noise && rand(`${key}:offline`) < 0.04) {
    offline = true
    receivedIn = actualIn + randInt(`${key}:sync`, 35, 200) * MINUTE_MS
  }
  const skew =
    !offline && noise && rand(`${key}:skew`) < 0.02
      ? randInt(`${key}:skewby`, 6, 20) * MINUTE_MS
      : 0

  const violation = flags.geofenceViolations.get(personId)
  const outside =
    violation !== undefined || (noise && rand(`${key}:geo`) < 0.05)
  const distanceMeters =
    violation ??
    (outside
      ? radius + randInt(`${key}:dist`, 60, 600)
      : randInt(`${key}:dist`, 3, Math.max(4, Math.floor(radius * 0.8))))

  const events: MockAttendanceEvent[] = [
    {
      ...base,
      id: `ev-${key}-in`,
      kind: "in",
      method,
      deviceTime: iso(actualIn + skew),
      receivedAt: iso(receivedIn),
      offline,
      inside: !outside,
      distanceMeters,
    },
  ]
  if (noise && rand(`${key}:dup`) < 0.01) {
    events.push({
      ...events[0]!,
      id: `ev-${key}-in2`,
      deviceTime: iso(actualIn + 2 * MINUTE_MS),
      receivedAt: iso(receivedIn + 2 * MINUTE_MS),
    })
  }
  const missingCheckout =
    flags.missingCheckouts && noise && rand(`${key}:missing`) < 0.01
  if (!missingCheckout) {
    const stay =
      noise && rand(`${key}:ot`) < 0.1
        ? randInt(`${key}:otmin`, 60, 150)
        : randInt(`${key}:out`, -5, 25)
    const actualOut = end + stay * MINUTE_MS
    events.push({
      ...base,
      id: `ev-${key}-out`,
      kind: "out",
      method,
      deviceTime: iso(actualOut + skew),
      receivedAt: iso(
        offline
          ? Math.max(receivedIn, actualOut + 5 * MINUTE_MS)
          : actualOut + 8000
      ),
      offline,
      inside: true,
      distanceMeters: randInt(
        `${key}:outdist`,
        3,
        Math.max(4, Math.floor(radius * 0.6))
      ),
    })
  }
  return events
}

function ensureWeek(tenantId: string, weekStart: string): void {
  let weeks = ops.weeks.get(tenantId)
  if (!weeks) {
    weeks = new Set()
    ops.weeks.set(tenantId, weeks)
  }
  if (weeks.has(weekStart)) return
  weeks.add(weekStart)
  ensureLeaveWeek(tenantId, addDaysIso(weekStart, -7))
  ensureLeaveWeek(tenantId, weekStart)

  const templates = tenantTemplates(tenantId)
  if (templates.size === 0) return
  const locations = new Map(
    db.locations
      .findMany((location) => location.tenantId === tenantId)
      .map((location) => [location.id, location])
  )
  const weekEnd = addDaysIso(weekStart, 6)
  const leaves = db.leaves.findMany(
    (leave) =>
      leave.tenantId === tenantId &&
      leave.status === "approved" &&
      leave.startDate <= weekEnd &&
      leave.endDate >= weekStart
  )
  const onLeave = (personnelId: string, date: string) =>
    leaves.some(
      (leave) =>
        leave.personnelId === personnelId &&
        leave.startDate <= date &&
        leave.endDate >= date
    )
  const people = db.personnel.findMany(
    (person) =>
      person.tenantId === tenantId &&
      !person.isFloater &&
      person.homeLocationId !== null &&
      person.status !== "passive"
  )
  for (const person of people) {
    for (let day = 0; day < 7; day += 1) {
      const date = addDaysIso(weekStart, day)
      if (!employedOn(person, date) || onLeave(person.id, date)) continue
      const template = templateFor(tenantId, person, date, templates)
      if (!template) continue
      const assignment = buildAssignment({
        id: `sh-${person.id}-${date}`,
        tenantId,
        personnelId: person.id,
        locationId: person.homeLocationId!,
        date,
        template,
      })
      addAssignment(assignment)
      ops.events.set(
        assignment.id,
        generateEvents(assignment, locations.get(assignment.locationId))
      )
    }
  }
}

/** [from, to] aralığını kapsayan haftaların planını üretir (idempotent). */
export function ensureRange(tenantId: string, from: string, to: string): void {
  for (
    let week = startOfIsoWeek(from);
    week <= to;
    week = addDaysIso(week, 7)
  ) {
    ensureWeek(tenantId, week)
  }
}

export function assignmentsBetween(
  tenantId: string,
  from: string,
  to: string,
  filter?: (assignment: MockShiftAssignment) => boolean
): MockShiftAssignment[] {
  ensureRange(tenantId, from, to)
  const days = ops.byDate.get(tenantId)
  const result: MockShiftAssignment[] = []
  for (const date of eachIsoDate(from, to)) {
    for (const assignment of days?.get(date) ?? []) {
      if (!filter || filter(assignment)) result.push(assignment)
    }
  }
  return result
}

/** Görünür (sunucuya ulaşmış) kayıtlar, cihaz zamanına göre sıralı */
export function visibleEvents(
  shiftId: string,
  now: Date
): MockAttendanceEvent[] {
  const nowMs = now.getTime()
  return (ops.events.get(shiftId) ?? [])
    .filter((event) => Date.parse(event.receivedAt) <= nowMs)
    .sort((a, b) => Date.parse(a.deviceTime) - Date.parse(b.deviceTime))
}

/** Yedek ve boştaki personel için konum (yedek havuzunda deterministik "son görev yeri") */
export function personnelPosition(
  person: MockPersonnel,
  locations: readonly MockLocation[]
): { lat: number; lng: number; locationName: string } | null {
  const home = person.homeLocationId
    ? locations.find((location) => location.id === person.homeLocationId)
    : locations.length > 0
      ? pick(`${person.id}:last`, locations)
      : undefined
  if (!home) return null
  return {
    lat: home.geofence.center.lat,
    lng: home.geofence.center.lng,
    locationName: home.name,
  }
}
