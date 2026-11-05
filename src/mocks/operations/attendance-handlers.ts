import { HttpResponse, http } from "msw"
import { z } from "zod"

import { rankBackupCandidates } from "@/features/attendance/domain/backup"
import { STATUS_PRIORITY } from "@/features/attendance/domain/status"
import {
  ATTENDANCE_STATUSES,
  CLOSE_REASON_LABELS,
  alarmListParamsSchema,
  attendanceRecordParamsSchema,
  closeReasonSchema,
  correctionPayloadSchema,
  liveBoardParamsSchema,
  type AttendanceRecord,
  type AttendanceStatus,
  type ShiftDetail,
} from "@/features/attendance/model/attendance"
import { toIsoDate } from "@/shared/lib/date"
import { formatTime, includesTr } from "@/shared/lib/format"
import { addDaysIso, eachIsoDate } from "@/shared/lib/work-time"

import { audit, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db } from "../db"
import type { MockAlarm, MockAttendanceEvent } from "../db/types"
import { apiPath, notFound, ok, parseBody, parseQuery, problem } from "../http"
import { broadcastEvent } from "../realtime"
import {
  buildLookups,
  evaluateAlarms,
  liveAssignments,
  locationRules,
  personName,
  resolveAlarm,
  serializeAlarm,
  serializeEvent,
  serializeLiveShift,
  snapshotShift,
} from "./attendance"
import { paginate, scopedLocationIds } from "./common"
import { rand } from "./hash"
import { approvedLeaveOn, assignmentsBetween, personnelPosition } from "./plan"
import { addAssignment, ops } from "./store"

function alarmInScope(auth: AuthContext, alarm: MockAlarm) {
  return (
    alarm.tenantId === auth.tenant.slug &&
    scopedLocationIds(auth, { locationId: alarm.locationId }).size > 0
  )
}

function findAlarm(auth: AuthContext, id: string) {
  const alarm = db.alarms.findById(id)
  return alarm && alarmInScope(auth, alarm) ? alarm : null
}

function respondAlarm(auth: AuthContext, alarm: MockAlarm) {
  return ok(
    serializeAlarm(alarm, buildLookups(auth.tenant.slug), {
      includePhone: auth.permissions.has("alarm:respond"),
      tenant: auth.tenant,
    })
  )
}

const photoSvg = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><rect width="240" height="180" fill="#e2e8f0"/><circle cx="120" cy="70" r="34" fill="#94a3b8"/><rect x="60" y="112" width="120" height="50" rx="25" fill="#94a3b8"/><text x="120" y="172" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#334155">${label}</text></svg>`

export const attendanceHandlers = [
  http.get(
    apiPath("/attendance/live"),
    withAuth("attendance:read", ({ request, auth }) => {
      const params = parseQuery(request, liveBoardParamsSchema)
      const now = mockClock.now()
      evaluateAlarms(auth.tenant, now)
      const allowed = scopedLocationIds(auth, params)
      const lookups = buildLookups(auth.tenant.slug)
      const all = liveAssignments(auth.tenant.slug, now, (assignment) =>
        allowed.has(assignment.locationId)
      )
        .map((assignment) =>
          serializeLiveShift(auth.tenant, assignment, lookups, now)
        )
        .filter(
          (item) =>
            !params.q ||
            includesTr(
              `${item.personnelName} ${item.employeeNumber} ${item.locationName}`,
              params.q
            )
        )
      const counts = Object.fromEntries(
        ATTENDANCE_STATUSES.map((status) => [status, 0])
      ) as Record<AttendanceStatus, number>
      for (const item of all) counts[item.status] += 1
      const items = all
        .filter((item) => !params.status || item.status === params.status)
        .sort(
          (a, b) =>
            STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
            a.startsAt.localeCompare(b.startsAt) ||
            a.personnelName.localeCompare(b.personnelName, "tr")
        )
      return ok({ date: toIsoDate(now), items, counts })
    })
  ),
  http.get(
    apiPath("/attendance/shifts/:id"),
    withAuth("attendance:read", ({ params, auth }) => {
      const assignment = ops.byId.get(String(params.id))
      if (
        !assignment ||
        assignment.tenantId !== auth.tenant.slug ||
        !scopedLocationIds(auth, { locationId: assignment.locationId }).size
      )
        return notFound()
      const now = mockClock.now()
      const lookups = buildLookups(auth.tenant.slug)
      const location = lookups.locations.get(assignment.locationId)
      const live = serializeLiveShift(auth.tenant, assignment, lookups, now)
      const detail: ShiftDetail = {
        ...live,
        events: snapshotShift(auth.tenant, assignment, now).events.map(
          serializeEvent
        ),
        location: {
          lat: location?.geofence.center.lat ?? 0,
          lng: location?.geofence.center.lng ?? 0,
          radiusMeters: location?.geofence.radiusMeters ?? 0,
        },
      }
      return ok(detail)
    })
  ),
  http.get(apiPath("/files/checkin-photos/:id"), ({ request, params }) => {
    const url = new URL(request.url)
    const expires = Number(url.searchParams.get("exp"))
    if (
      !url.searchParams.get("sig") ||
      !expires ||
      expires < mockClock.now().getTime()
    ) {
      return problem(403, "URL_EXPIRED", "Fotoğraf bağlantısının süresi doldu.")
    }
    return new HttpResponse(
      photoSvg(`Giriş fotoğrafı · ${String(params.id).slice(-6)}`),
      {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "no-store, private",
        },
      }
    )
  }),
  http.get(
    apiPath("/attendance/records"),
    withAuth("attendance:read", ({ request, auth }) => {
      const params = parseQuery(request, attendanceRecordParamsSchema)
      const now = mockClock.now()
      const today = toIsoDate(now)
      const to = params.to ?? today
      const from = params.from ?? addDaysIso(to, -6)
      if (from > to || eachIsoDate(from, to).length > 62) {
        return problem(
          400,
          "INVALID_RANGE",
          "Tarih aralığı en fazla 62 gün olabilir."
        )
      }
      const allowed = scopedLocationIds(auth, params)
      const lookups = buildLookups(auth.tenant.slug)
      const nowMs = now.getTime()
      const rows: (AttendanceRecord & { sortKey: number })[] =
        assignmentsBetween(
          auth.tenant.slug,
          from,
          to,
          (assignment) =>
            allowed.has(assignment.locationId) &&
            Date.parse(assignment.startsAt) <= nowMs
        ).map((assignment) => {
          const snapshot = snapshotShift(auth.tenant, assignment, now)
          const person = lookups.personnel.get(assignment.personnelId)
          return {
            shiftId: assignment.id,
            date: assignment.date,
            personnelId: assignment.personnelId,
            personnelName: person ? personName(person) : "—",
            employeeNumber: person?.employeeNumber ?? "—",
            locationName:
              lookups.locations.get(assignment.locationId)?.name ?? "—",
            startsAt: assignment.startsAt,
            endsAt: assignment.endsAt,
            checkIn: snapshot.checkIn ? serializeEvent(snapshot.checkIn) : null,
            checkOut: snapshot.checkOut
              ? serializeEvent(snapshot.checkOut)
              : null,
            anomalies: snapshot.anomalies,
            corrected: snapshot.events.some((event) => event.corrected),
            // Kayıtlar cihaz zamanına göre sıralanır (geç senkron olanlar doğru yerinde durur)
            sortKey: Date.parse(
              snapshot.checkIn?.deviceTime ?? assignment.startsAt
            ),
          }
        })
      const filtered = rows
        .filter(
          (row) =>
            (!params.anomaly ||
              row.anomalies.some(
                (anomaly) => anomaly.code === params.anomaly
              )) &&
            (!params.q ||
              includesTr(
                `${row.personnelName} ${row.employeeNumber} ${row.locationName}`,
                params.q
              ))
        )
        .sort((a, b) =>
          params.order === "asc" ? a.sortKey - b.sortKey : b.sortKey - a.sortKey
        )
        .map(({ sortKey: _sortKey, ...row }) => row)
      return ok(paginate(filtered, params.page, params.pageSize))
    })
  ),
  http.post(
    apiPath("/attendance/records/:shiftId/correction"),
    withAuth("attendance:correct", async ({ request, params, auth }) => {
      const assignment = ops.byId.get(String(params.shiftId))
      if (
        !assignment ||
        assignment.tenantId !== auth.tenant.slug ||
        !scopedLocationIds(auth, { locationId: assignment.locationId }).size
      )
        return notFound()
      const body = await parseBody(request, correctionPayloadSchema)
      if (!body.success) return body.response
      const { checkInAt, checkOutAt, reason } = body.data
      if (checkOutAt && Date.parse(checkOutAt) <= Date.parse(checkInAt)) {
        return problem(
          422,
          "VALIDATION_FAILED",
          "Çıkış girişten sonra olmalı.",
          {
            checkOutTime: ["Çıkış saati giriş saatinden sonra olmalı."],
          }
        )
      }
      const now = mockClock.now()
      if (
        Date.parse(checkInAt) > now.getTime() ||
        (checkOutAt && Date.parse(checkOutAt) > now.getTime())
      ) {
        return problem(
          422,
          "VALIDATION_FAILED",
          "Gelecek bir saat girilemez.",
          {
            [checkOutAt && Date.parse(checkOutAt) > now.getTime()
              ? "checkOutTime"
              : "checkInTime"]: ["Henüz gelmemiş bir saat girilemez."],
          }
        )
      }
      const before = snapshotShift(auth.tenant, assignment, now)
      const fmt = (event: MockAttendanceEvent | null) =>
        event ? formatTime(event.deviceTime) : "yok"
      const base = {
        tenantId: auth.tenant.slug,
        shiftId: assignment.id,
        personnelId: assignment.personnelId,
        method: "manual" as const,
        offline: false,
        inside: true,
        distanceMeters: 0,
        hasPhoto: false,
        corrected: true,
      }
      const events: MockAttendanceEvent[] = [
        {
          ...base,
          id: `ev-${assignment.id}-cin-${now.getTime()}`,
          kind: "in",
          deviceTime: checkInAt,
        },
      ]
      if (checkOutAt) {
        events.push({
          ...base,
          id: `ev-${assignment.id}-cout-${now.getTime()}`,
          kind: "out",
          deviceTime: checkOutAt,
          receivedAt: checkOutAt,
        })
      }
      ops.events.set(assignment.id, events)
      const person = db.personnel.findById(assignment.personnelId)
      audit(auth, {
        action: "Yoklama düzeltildi",
        targetType: "attendance",
        targetLabel: `${person ? personName(person) : assignment.personnelId} · ${assignment.date}`,
        details: `Önce: ${fmt(before.checkIn)}–${fmt(before.checkOut)} · Sonra: ${formatTime(checkInAt)}–${checkOutAt ? formatTime(checkOutAt) : "yok"} · Gerekçe: ${reason}`,
      })
      const alarm = db.alarms.findFirst(
        (item) => item.shiftId === assignment.id && item.status !== "resolved"
      )
      if (alarm) {
        resolveAlarm(
          alarm,
          {
            reason: "system_error",
            note: `Yoklama düzeltildi: ${reason}`,
            backupPersonnelId: null,
          },
          auth.actorName,
          now
        )
      }
      broadcastEvent("attendance.updated", {
        tenantId: auth.tenant.slug,
        shiftId: assignment.id,
      })
      const lookups = buildLookups(auth.tenant.slug)
      const after = snapshotShift(auth.tenant, assignment, now)
      const record: AttendanceRecord = {
        shiftId: assignment.id,
        date: assignment.date,
        personnelId: assignment.personnelId,
        personnelName: person ? personName(person) : "—",
        employeeNumber: person?.employeeNumber ?? "—",
        locationName: lookups.locations.get(assignment.locationId)?.name ?? "—",
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
        checkIn: after.checkIn ? serializeEvent(after.checkIn) : null,
        checkOut: after.checkOut ? serializeEvent(after.checkOut) : null,
        anomalies: after.anomalies,
        corrected: true,
      }
      return ok(record)
    })
  ),
  http.get(
    apiPath("/alarms"),
    withAuth("attendance:read", ({ request, auth }) => {
      const params = parseQuery(request, alarmListParamsSchema)
      const now = mockClock.now()
      evaluateAlarms(auth.tenant, now)
      const allowed = scopedLocationIds(auth, params)
      const today = toIsoDate(now)
      const all = db.alarms.findMany(
        (alarm) =>
          alarm.tenantId === auth.tenant.slug && allowed.has(alarm.locationId)
      )
      const resolvedToday = (alarm: MockAlarm) =>
        alarm.status === "resolved" &&
        alarm.resolvedAt !== null &&
        toIsoDate(alarm.resolvedAt) === today
      const selected = all
        .filter((alarm) =>
          params.durum === "aktif"
            ? alarm.status !== "resolved"
            : params.durum === "eskale"
              ? alarm.status === "escalated"
              : resolvedToday(alarm)
        )
        .sort((a, b) =>
          params.durum === "cozulen"
            ? (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? "")
            : a.dueAt.localeCompare(b.dueAt)
        )
      const lookups = buildLookups(auth.tenant.slug)
      return ok({
        items: selected.map((alarm) =>
          serializeAlarm(alarm, lookups, {
            includePhone: auth.permissions.has("alarm:respond"),
            tenant: auth.tenant,
          })
        ),
        counts: {
          active: all.filter((alarm) => alarm.status !== "resolved").length,
          escalated: all.filter((alarm) => alarm.status === "escalated").length,
          resolvedToday: all.filter(resolvedToday).length,
        },
      })
    })
  ),
  http.get(
    apiPath("/alarms/:id/backup-candidates"),
    withAuth("alarm:respond", ({ params, auth }) => {
      const alarm = findAlarm(auth, String(params.id))
      const shift = alarm ? ops.byId.get(alarm.shiftId) : undefined
      if (!alarm || !shift) return notFound()
      const tenantId = auth.tenant.slug
      const location = db.locations.findById(shift.locationId)
      if (!location) return notFound()
      const locations = db.locations.findMany(
        (item) => item.tenantId === tenantId
      )
      const startMs = Date.parse(shift.startsAt)
      const endMs = Date.parse(shift.endsAt)
      const busy = new Set(
        assignmentsBetween(
          tenantId,
          addDaysIso(shift.date, -1),
          addDaysIso(shift.date, 1),
          (other) =>
            Date.parse(other.startsAt) < endMs &&
            startMs < Date.parse(other.endsAt)
        ).map((other) => other.personnelId)
      )
      const pool = db.personnel.findMany(
        (person) =>
          person.tenantId === tenantId &&
          person.status === "active" &&
          person.id !== shift.personnelId &&
          (person.isFloater ||
            person.serviceLine ===
              db.personnel.findById(shift.personnelId)?.serviceLine)
      )
      const ranked = rankBackupCandidates(
        location.geofence.center,
        pool.map((person) => {
          const position = personnelPosition(person, locations)
          return {
            personnelId: person.id,
            name: personName(person),
            employeeNumber: person.employeeNumber,
            isFloater: person.isFloater,
            currentLocationName: position?.locationName ?? null,
            position: position
              ? { lat: position.lat, lng: position.lng }
              : null,
            busy: busy.has(person.id),
            onLeave: approvedLeaveOn(tenantId, person.id, shift.date) !== null,
          }
        })
      )
      return ok({
        items: ranked.map((candidate) => ({
          personnelId: candidate.personnelId,
          name: candidate.name,
          employeeNumber: candidate.employeeNumber,
          isFloater: candidate.isFloater,
          currentLocationName: candidate.currentLocationName,
          distanceKm: Number.isFinite(candidate.distanceKm)
            ? candidate.distanceKm
            : 999,
        })),
      })
    })
  ),
  http.post(
    apiPath("/alarms/:id/backup"),
    withAuth("alarm:respond", async ({ request, params, auth }) => {
      const alarm = findAlarm(auth, String(params.id))
      const shift = alarm ? ops.byId.get(alarm.shiftId) : undefined
      if (!alarm || !shift) return notFound()
      if (alarm.status === "resolved") {
        return problem(409, "ALARM_RESOLVED", "Alarm zaten çözülmüş.")
      }
      const body = await parseBody(
        request,
        z.object({ personnelId: z.string().min(1) })
      )
      if (!body.success) return body.response
      const backup = db.personnel.findById(body.data.personnelId)
      if (
        !backup ||
        backup.tenantId !== auth.tenant.slug ||
        backup.status !== "active"
      ) {
        return problem(422, "VALIDATION_FAILED", "Yedek personel bulunamadı.", {
          personnelId: ["Yedek personel bulunamadı."],
        })
      }
      const startMs = Date.parse(shift.startsAt)
      const endMs = Date.parse(shift.endsAt)
      const clash = assignmentsBetween(
        auth.tenant.slug,
        addDaysIso(shift.date, -1),
        addDaysIso(shift.date, 1),
        (other) =>
          other.personnelId === backup.id &&
          Date.parse(other.startsAt) < endMs &&
          startMs < Date.parse(other.endsAt)
      )[0]
      if (clash) {
        return problem(
          409,
          "BACKUP_BUSY",
          "Seçilen personelin bu saatlerde başka vardiyası var."
        )
      }
      const now = mockClock.now()
      addAssignment({
        ...shift,
        id: `shb-${alarm.id}`,
        personnelId: backup.id,
        kind: "backup",
        replacesShiftId: shift.id,
      })
      ops.events.set(`shb-${alarm.id}`, [])
      const updated = resolveAlarm(
        alarm,
        { reason: "backup_assigned", note: null, backupPersonnelId: backup.id },
        auth.actorName,
        now
      )
      const person = db.personnel.findById(shift.personnelId)
      audit(auth, {
        action: "Yedek personel atandı",
        targetType: "alarm",
        targetLabel: person ? personName(person) : shift.personnelId,
        details: `Yedek: ${personName(backup)} · ${shift.date} ${formatTime(shift.startsAt)}`,
      })
      broadcastEvent("attendance.updated", {
        tenantId: auth.tenant.slug,
        shiftId: shift.id,
      })
      return respondAlarm(auth, updated)
    })
  ),
  http.post(
    apiPath("/alarms/:id/notes"),
    withAuth("alarm:respond", async ({ request, params, auth }) => {
      const alarm = findAlarm(auth, String(params.id))
      if (!alarm) return notFound()
      const body = await parseBody(
        request,
        z.object({ text: z.string().trim().min(2).max(300) })
      )
      if (!body.success) return body.response
      const updated = db.alarms.update(alarm.id, {
        notes: [
          ...alarm.notes,
          {
            at: mockClock.now().toISOString(),
            author: auth.actorName,
            text: body.data.text,
          },
        ],
      })!
      broadcastEvent("alarm.updated", {
        tenantId: alarm.tenantId,
        alarmId: alarm.id,
      })
      return respondAlarm(auth, updated)
    })
  ),
  http.post(
    apiPath("/alarms/:id/close"),
    withAuth("alarm:respond", async ({ request, params, auth }) => {
      const alarm = findAlarm(auth, String(params.id))
      if (!alarm) return notFound()
      if (alarm.status === "resolved") {
        return problem(409, "ALARM_RESOLVED", "Alarm zaten çözülmüş.")
      }
      const body = await parseBody(
        request,
        z
          .object({
            reason: closeReasonSchema,
            note: z.string().trim().max(300).optional(),
          })
          .refine(
            (value) =>
              value.reason !== "other" || (value.note?.length ?? 0) >= 5,
            {
              message: "Açıklama zorunlu",
              path: ["note"],
            }
          )
      )
      if (!body.success) return body.response
      const updated = resolveAlarm(
        alarm,
        {
          reason: body.data.reason,
          note: body.data.note || null,
          backupPersonnelId: null,
        },
        auth.actorName,
        mockClock.now()
      )
      const person = db.personnel.findById(alarm.personnelId)
      audit(auth, {
        action: "Alarm kapatıldı",
        targetType: "alarm",
        targetLabel: person ? personName(person) : alarm.personnelId,
        details: `Gerekçe: ${CLOSE_REASON_LABELS[body.data.reason]}${body.data.note ? ` · ${body.data.note}` : ""}`,
      })
      return respondAlarm(auth, updated)
    })
  ),
  http.get(
    apiPath("/dashboard/attendance"),
    withAuth("attendance:read", ({ request, auth }) => {
      const params = parseQuery(
        request,
        z.object({
          orgUnitId: z.string().min(1).optional().catch(undefined),
          days: z.coerce.number().int().min(7).max(31).catch(14),
        })
      )
      const now = mockClock.now()
      evaluateAlarms(auth.tenant, now)
      const today = toIsoDate(now)
      const from = addDaysIso(today, -(params.days - 1))
      const allowed = scopedLocationIds(auth, { orgUnitId: params.orgUnitId })
      const lookups = buildLookups(auth.tenant.slug)
      const nowMs = now.getTime()
      const shifts = assignmentsBetween(
        auth.tenant.slug,
        from,
        today,
        (assignment) =>
          allowed.has(assignment.locationId) &&
          assignment.kind === "regular" &&
          Date.parse(assignment.startsAt) +
            locationRules(auth.tenant, assignment.locationId).toleranceMinutes *
              60_000 <=
            nowMs
      )
      const perDay = new Map<
        string,
        { expected: number; present: number; late: number; absent: number }
      >()
      const perUnit = new Map<
        string,
        { expected: number; present: number; late: number }
      >()
      let todayStats = { expected: 0, present: 0, late: 0, absent: 0 }
      let alarms = 0
      let breached = 0
      let responseTotal = 0
      const sla = auth.tenant.rules.alarmSlaMinutes
      for (const shift of shifts) {
        const snapshot = snapshotShift(auth.tenant, shift, now)
        const present = snapshot.checkIn !== null || snapshot.hasBackup
        const late =
          snapshot.status === "late" ||
          (snapshot.status === "checked_out" &&
            snapshot.lateMinutes >
              locationRules(auth.tenant, shift.locationId).toleranceMinutes)
        const absent = !present
        const day = perDay.get(shift.date) ?? {
          expected: 0,
          present: 0,
          late: 0,
          absent: 0,
        }
        day.expected += 1
        if (present) day.present += 1
        if (late) day.late += 1
        if (absent) day.absent += 1
        perDay.set(shift.date, day)
        const location = lookups.locations.get(shift.locationId)
        if (location) {
          const unit = perUnit.get(location.orgUnitId) ?? {
            expected: 0,
            present: 0,
            late: 0,
          }
          unit.expected += 1
          if (present) unit.present += 1
          if (late) unit.late += 1
          perUnit.set(location.orgUnitId, unit)
        }
        if (shift.date === today) todayStats = day
        if (late || absent || snapshot.hasBackup) {
          alarms += 1
          // Geçmiş günlerin müdahale süresi simülasyonu; bugünün alarmları gerçek kayıttan
          const stored = db.alarms.findFirst(
            (alarm) => alarm.shiftId === shift.id
          )
          const minutes = stored?.resolvedAt
            ? Math.max(
                0,
                (Date.parse(stored.resolvedAt) - Date.parse(stored.createdAt)) /
                  60_000
              )
            : 4 + rand(`${shift.id}:resp`) * 22
          responseTotal += minutes
          if (minutes > sla) breached += 1
        }
      }
      const rate = (present: number, expected: number) =>
        expected === 0 ? 1 : Math.round((present / expected) * 1000) / 1000
      return ok({
        today: {
          ...todayStats,
          attendanceRate: rate(todayStats.present, todayStats.expected),
        },
        trend: eachIsoDate(from, today).map((date) => {
          const day = perDay.get(date) ?? {
            expected: 0,
            present: 0,
            late: 0,
            absent: 0,
          }
          return {
            date,
            attendanceRate: rate(day.present, day.expected),
            late: day.late,
            absent: day.absent,
          }
        }),
        regions: [...perUnit.entries()]
          .map(([orgUnitId, unit]) => ({
            orgUnitId,
            name: lookups.orgUnitNames.get(orgUnitId) ?? orgUnitId,
            attendanceRate: rate(unit.present, unit.expected),
            lateRate:
              unit.expected === 0
                ? 0
                : Math.round((unit.late / unit.expected) * 1000) / 1000,
          }))
          .sort((a, b) => a.attendanceRate - b.attendanceRate)
          .slice(0, 12),
        sla: {
          alarms,
          breached,
          avgResponseMinutes:
            alarms === 0 ? 0 : Math.round((responseTotal / alarms) * 10) / 10,
          slaMinutes: sla,
        },
      })
    })
  ),
]

/** Dev paneli: şu an bekleniyor durumundaki rastgele bir personel için giriş gönderir */
export function simulateCheckIn(tenantId: string): string | null {
  const tenant = db.tenants.findById(tenantId)
  if (!tenant) return null
  const now = mockClock.now()
  const waiting = liveAssignments(tenantId, now).filter((assignment) => {
    const snapshot = snapshotShift(tenant, assignment, now)
    return (
      (snapshot.status === "expected" || snapshot.status === "no_show") &&
      Date.parse(assignment.startsAt) - now.getTime() < 60 * 60_000
    )
  })
  const target = waiting[0]
  if (!target) return null
  const event: MockAttendanceEvent = {
    id: `ev-${target.id}-sim-${now.getTime()}`,
    tenantId,
    shiftId: target.id,
    personnelId: target.personnelId,
    kind: "in",
    method: "qr",
    deviceTime: now.toISOString(),
    receivedAt: now.toISOString(),
    offline: false,
    inside: true,
    distanceMeters: 12,
    hasPhoto: true,
    corrected: false,
  }
  ops.events.set(target.id, [...(ops.events.get(target.id) ?? []), event])
  broadcastEvent("attendance.checked_in", { tenantId, shiftId: target.id })
  evaluateAlarms(tenant, now)
  return target.personnelId
}
