import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { z } from "zod"

import {
  alarmListSchema,
  attendanceRecordListSchema,
  backupCandidateListSchema,
  liveBoardSchema,
} from "@/features/attendance/model/attendance"
import {
  payrollExportSchema,
  payrollPreviewSchema,
  payrollProfileListSchema,
} from "@/features/payroll-export/model/profile"
import {
  timesheetGridSchema,
  timesheetPeriodListSchema,
  timesheetPeriodSchema,
} from "@/features/timesheet/model/timesheet"
import { leaveDecisionResultSchema, leaveSchema } from "@/entities/leave"
import {
  locationScheduleSchema,
  scheduleBatchResultSchema,
} from "@/entities/shift"
import { applyTestScenario } from "@/test/scenario"
import { ApiError } from "@/shared/api/errors"
import { configureHttp, http } from "@/shared/api/http"
import { decodeWindows1254 } from "@/shared/lib/encoding"
import { addDaysIso } from "@/shared/lib/work-time"

import { identityFor } from "./auth/identities"
import { mintMockToken } from "./auth/token"
import { mockClock } from "./clock"
import { db } from "./db"
import { evaluateAlarms } from "./operations/attendance"
import { simulateCheckIn } from "./operations/attendance-handlers"
import { ops } from "./operations/store"
import { scenarioLocationId } from "./scenarios/phase2"

const any = z.unknown()

function signIn(tenant: string, user: string) {
  const identity = identityFor(tenant, user)
  const token = mintMockToken({
    organization: identity.organization,
    userId: identity.userId,
    expiresAt: Date.now() + 3_600_000,
  })
  configureHttp({ getAccessToken: () => token })
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((caught: unknown) => caught)
  if (!(error instanceof ApiError)) throw new Error("ApiError bekleniyordu")
  return error
}

const MONDAY = "2026-09-14"

describe("Faz 2 mock API: yoklama ve alarm", () => {
  it("TC-2.3-01 morning-no-show 07:10 (tolerans 10 dk): 3 alarm, pano 3 Gelmedi", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:09:00+03:00`)
    signIn("temizlik-orta", "bolge")
    expect((await http.get("/alarms", alarmListSchema)).counts.active).toBe(0)

    mockClock.freeze(`${MONDAY}T07:10:00+03:00`)
    const alarms = await http.get("/alarms", alarmListSchema)
    expect(alarms.counts.active).toBe(3)
    expect(alarms.items[0]?.dueAt).toBe("2026-09-14T04:25:00.000Z")
    expect(alarms.items[0]?.personnelPhone).not.toBeNull()
    const live = await http.get("/attendance/live", liveBoardSchema)
    expect(live.counts.no_show).toBe(3)
    expect(
      live.items.slice(0, 3).every((item) => item.status === "no_show")
    ).toBe(true)
  })

  it("TC-2.3-04 15 dk çözülmeyen alarm operasyon müdürüne eskale edilir", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:24:00+03:00`)
    signIn("temizlik-orta", "operasyon")
    expect((await http.get("/alarms", alarmListSchema)).counts.escalated).toBe(
      0
    )
    mockClock.freeze(`${MONDAY}T07:25:00+03:00`)
    const escalated = await http.get("/alarms", alarmListSchema, {
      params: { durum: "eskale" },
    })
    expect(escalated.items).toHaveLength(3)
    expect(escalated.items[0]?.escalatedTo).toBe("Operasyon müdürü")
  })

  it("TC-2.3-03 yedek önerileri mesafeye göre sıralı; atama alarmı çözer ve pano Yedek atandı der", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:12:00+03:00`)
    signIn("temizlik-orta", "bolge")
    const alarm = (await http.get("/alarms", alarmListSchema)).items[0]!
    const candidates = await http.get(
      `/alarms/${alarm.id}/backup-candidates`,
      backupCandidateListSchema
    )
    const distances = candidates.items.map((item) => item.distanceKm)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
    const chosen = candidates.items[0]!
    const resolved = await http.post(`/alarms/${alarm.id}/backup`, any, {
      body: { personnelId: chosen.personnelId },
    })
    expect(resolved).toMatchObject({
      status: "resolved",
      resolution: { reason: "backup_assigned" },
    })
    const live = await http.get("/attendance/live", liveBoardSchema)
    expect(live.counts.backup_assigned).toBe(1)
    expect(
      live.items.some(
        (item) => item.isBackup && item.personnelId === chosen.personnelId
      )
    ).toBe(true)
    expect(
      db.auditEvents.findFirst(
        (event) => event.action === "Yedek personel atandı"
      )
    ).toBeTruthy()
    expect(
      (
        await failure(
          http.post(`/alarms/${alarm.id}/backup`, any, {
            body: { personnelId: chosen.personnelId },
          })
        )
      ).status
    ).toBe(409)
  })

  it("TC-2.3-05 gerekçesiz kapatma 422; gerekçeyle kapatma ve not", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:12:00+03:00`)
    signIn("temizlik-orta", "supervizor")
    const alarm = (await http.get("/alarms", alarmListSchema)).items[0]!
    expect(
      (await failure(http.post(`/alarms/${alarm.id}/close`, any, { body: {} })))
        .status
    ).toBe(422)
    expect(
      (
        await failure(
          http.post(`/alarms/${alarm.id}/close`, any, {
            body: { reason: "other" },
          })
        )
      ).fieldErrors
    ).toHaveProperty("note")
    await http.post(`/alarms/${alarm.id}/notes`, any, {
      body: { text: "Telefonla ulaşıldı" },
    })
    const closed = await http.post(`/alarms/${alarm.id}/close`, any, {
      body: { reason: "late_arrival", note: "Trafik" },
    })
    expect(closed).toMatchObject({
      status: "resolved",
      notes: [{ text: "Telefonla ulaşıldı" }],
    })
  })

  it("geç gelen personelin girişi ulaşınca alarm otomatik kapanır", () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:15:00+03:00`)
    const tenant = db.tenants.findById("temizlik-orta")!
    evaluateAlarms(tenant)
    expect(
      db.alarms.count(
        (alarm) =>
          alarm.status !== "resolved" && alarm.tenantId === "temizlik-orta"
      )
    ).toBe(3)
    ops.flags.noShowPersonnelIds.clear()
    expect(simulateCheckIn("temizlik-orta")).not.toBeNull()
    expect(
      db.alarms.count(
        (alarm) =>
          alarm.status === "resolved" &&
          alarm.resolution?.reason === "late_arrival"
      )
    ).toBe(1)
    expect(simulateCheckIn("yok")).toBeNull()
  })

  it("TC-2.3-07 offline-sync-burst: kayıtlar cihaz zamanına göre sıralı, Geç senkron rozeti", async () => {
    applyTestScenario("offline-sync-burst")
    mockClock.freeze(`${MONDAY}T07:20:00+03:00`)
    signIn("temizlik-orta", "admin")
    const locationId = scenarioLocationId("temizlik-orta")!
    expect(
      (await http.get("/alarms", alarmListSchema, { params: { locationId } }))
        .counts.active
    ).toBe(5)

    mockClock.freeze(`${MONDAY}T11:30:00+03:00`)
    const records = await http.get(
      "/attendance/records",
      attendanceRecordListSchema,
      {
        params: {
          locationId,
          from: MONDAY,
          to: MONDAY,
          anomaly: "late_sync",
          pageSize: 50,
        },
      }
    )
    expect(records.items).toHaveLength(5)
    const deviceTimes = records.items.map((item) =>
      Date.parse(item.checkIn!.deviceTime)
    )
    expect(deviceTimes).toEqual([...deviceTimes].sort((a, b) => b - a))
    expect(records.items.every((item) => item.checkIn?.offline)).toBe(true)
    expect(
      records.items[0]?.anomalies.find(
        (anomaly) => anomaly.code === "late_sync"
      )?.detail
    ).toMatch(/sonra ulaştı/)
    // Geç ulaşan girişler alarmları "Geç geldi" ile kapatır
    const alarms = await http.get("/alarms", alarmListSchema, {
      params: { locationId, durum: "cozulen" },
    })
    expect(alarms.items.map((item) => item.resolution?.note)).toContain(
      "Giriş kaydı geç senkronize oldu (çevrimdışı)."
    )
  })

  it("TC-2.4-01 geofence dışı check-in: anomali ve mesafe; TC-2.4-02 düzeltme denetim kaydı", async () => {
    applyTestScenario("geofence-violations")
    mockClock.freeze(`${MONDAY}T09:00:00+03:00`)
    signIn("temizlik-orta", "supervizor")
    const records = await http.get(
      "/attendance/records",
      attendanceRecordListSchema,
      {
        params: { anomaly: "outside_geofence", from: MONDAY, to: MONDAY },
      }
    )
    expect(
      records.items.map((item) => item.anomalies[0]?.detail).sort()
    ).toEqual(["220 m", "480 m", "650 m"])

    const target = records.items[0]!
    mockClock.freeze(`${MONDAY}T16:00:00+03:00`)
    expect(
      (
        await failure(
          http.post(`/attendance/records/${target.shiftId}/correction`, any, {
            body: {
              checkInAt: target.startsAt,
              checkOutAt: null,
              reason: "kısa",
            },
          })
        )
      ).status
    ).toBe(422)
    expect(
      (
        await failure(
          http.post(`/attendance/records/${target.shiftId}/correction`, any, {
            body: {
              checkInAt: target.endsAt,
              checkOutAt: target.startsAt,
              reason: "Cihaz arızası nedeniyle",
            },
          })
        )
      ).fieldErrors
    ).toHaveProperty("checkOutTime")
    const corrected = await http.post(
      `/attendance/records/${target.shiftId}/correction`,
      any,
      {
        body: {
          checkInAt: target.startsAt,
          checkOutAt: target.endsAt,
          reason: "Cihaz arızası nedeniyle",
        },
      }
    )
    expect(corrected).toMatchObject({ corrected: true, anomalies: [] })
    const audit = db.auditEvents.findFirst(
      (event) => event.action === "Yoklama düzeltildi"
    )
    expect(audit?.details).toMatch(
      /^Önce: \d\d:\d\d–\d\d:\d\d · Sonra: 07:00–15:00 · Gerekçe: Cihaz arızası nedeniyle$/
    )
  })

  it("kapsam: süpervizör yalnızca kendi lokasyonlarının vardiyalarını görür; fotoğraf adresi kısa ömürlü", async () => {
    mockClock.freeze(`${MONDAY}T10:00:00+03:00`)
    signIn("temizlik-orta", "supervizor")
    const supervised = new Set(
      (
        db.users.findById("u-temizlik-orta-supervizor")!.scope as {
          ids: string[]
        }
      ).ids
    )
    const live = await http.get("/attendance/live", liveBoardSchema)
    expect(live.items.length).toBeGreaterThan(0)
    expect(live.items.every((item) => supervised.has(item.locationId))).toBe(
      true
    )
    const withPhoto = live.items.find((item) => item.checkIn?.photoUrl)!
    const shift = await http.get(`/attendance/shifts/${withPhoto.shiftId}`, any)
    expect(shift).toMatchObject({ shiftId: withPhoto.shiftId })
    const photo = new URL(withPhoto.checkIn!.photoUrl!)
    const fresh = await fetch(photo)
    expect(fresh.headers.get("Cache-Control")).toBe("no-store, private")
    mockClock.freeze(`${MONDAY}T10:10:00+03:00`)
    expect((await fetch(photo)).status).toBe(403)
    signIn("temizlik-orta", "finans")
    expect((await failure(http.get("/attendance/live", any))).status).toBe(403)
  })

  it("dashboard: katılım, trend, bölge ve SLA özetleri", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:30:00+03:00`)
    signIn("temizlik-orta", "admin")
    const dashboard = await http.get("/dashboard/attendance", any)
    expect(dashboard).toMatchObject({
      today: { absent: 3 },
      sla: { slaMinutes: 15 },
    })
    expect((dashboard as { trend: unknown[] }).trend).toHaveLength(14)
  })
})

describe("Faz 2 mock API: vardiya ve izin", () => {
  it("TC-2.1-05 başkası planı kaydettiyse 409; force ile üzerine yazılır", async () => {
    mockClock.freeze(`${MONDAY}T09:00:00+03:00`)
    signIn("temizlik-orta", "bolge")
    const locationId = scenarioLocationId("temizlik-orta")!
    const schedule = await http.get("/schedule", locationScheduleSchema, {
      params: { locationId, from: MONDAY, to: addDaysIso(MONDAY, 6) },
    })
    const person = schedule.roster[0]!
    const body = {
      locationId,
      version: schedule.version,
      changes: [
        {
          personnelId: person.id,
          date: "2026-09-16",
          templateId: "tpl-temizlik-orta-aksam",
        },
      ],
    }
    const first = await http.post(
      "/schedule/batch",
      scheduleBatchResultSchema,
      { body }
    )
    expect(first.version).toBe(schedule.version + 1)
    const conflict = await failure(http.post("/schedule/batch", any, { body }))
    expect(conflict).toMatchObject({ status: 409, code: "VERSION_CONFLICT" })
    const forced = await http.post(
      "/schedule/batch",
      scheduleBatchResultSchema,
      { body: { ...body, force: true } }
    )
    expect(forced.version).toBe(schedule.version + 2)
    const after = await http.get("/schedule", locationScheduleSchema, {
      params: { locationId, from: MONDAY, to: addDaysIso(MONDAY, 6) },
    })
    expect(
      after.assignments.find(
        (item) => item.personnelId === person.id && item.date === "2026-09-16"
      )?.code
    ).toBe("A")
    expect(
      (
        await failure(
          http.get("/schedule", any, {
            params: { locationId, from: MONDAY, to: "2026-12-31" },
          })
        )
      ).status
    ).toBe(400)
  })

  it("TC-2.1-04 sunucu: onaylı izin gününe atama 422 ON_LEAVE; başka lokasyonla çakışma 422 OVERLAP", async () => {
    mockClock.freeze(`${MONDAY}T09:00:00+03:00`)
    signIn("temizlik-orta", "admin")
    const locationId = scenarioLocationId("temizlik-orta")!
    const schedule = await http.get("/schedule", locationScheduleSchema, {
      params: { locationId, from: MONDAY, to: addDaysIso(MONDAY, 6) },
    })
    const person = schedule.roster[0]!
    db.leaves.insert({
      id: "lv-test",
      tenantId: "temizlik-orta",
      personnelId: person.id,
      type: "annual",
      startDate: "2026-09-17",
      endDate: "2026-09-17",
      days: 1,
      status: "approved",
      note: null,
      requestedAt: "2026-09-01T09:00:00+03:00",
      requestedBy: "Test",
      decidedAt: null,
      decidedBy: null,
      decisionNote: null,
    })
    const onLeave = await failure(
      http.post("/schedule/batch", any, {
        body: {
          locationId,
          version: schedule.version,
          changes: [
            {
              personnelId: person.id,
              date: "2026-09-17",
              templateId: "tpl-temizlik-orta-sabah",
            },
          ],
        },
      })
    )
    expect(onLeave).toMatchObject({ status: 422, code: "ON_LEAVE" })

    const busy = schedule.assignments.find(
      (item) =>
        item.date === MONDAY &&
        item.locationId === locationId &&
        item.kind === "regular"
    )!
    const other = db.locations.findFirst(
      (item) => item.tenantId === "temizlik-orta" && item.id !== locationId
    )!
    const otherSchedule = await http.get("/schedule", locationScheduleSchema, {
      params: { locationId: other.id, from: MONDAY, to: addDaysIso(MONDAY, 6) },
    })
    const overlap = await failure(
      http.post("/schedule/batch", any, {
        body: {
          locationId: other.id,
          version: otherSchedule.version,
          changes: [
            {
              personnelId: busy.personnelId,
              date: MONDAY,
              templateId: busy.templateId,
            },
          ],
        },
      })
    )
    expect(overlap).toMatchObject({ status: 422, code: "OVERLAP" })
    signIn("temizlik-orta", "supervizor")
    expect(
      (
        await failure(
          http.post("/schedule/batch", any, {
            body: { locationId, version: 0, changes: [] },
          })
        )
      ).status
    ).toBe(403)
  })

  it("izin: çakışma ve bakiye 422, ret gerekçesi zorunlu, onay vardiyaları kaldırır", async () => {
    mockClock.freeze(`${MONDAY}T09:00:00+03:00`)
    signIn("temizlik-orta", "bolge")
    const locationId = scenarioLocationId("temizlik-orta")!
    const schedule = await http.get("/schedule", locationScheduleSchema, {
      params: { locationId, from: MONDAY, to: addDaysIso(MONDAY, 6) },
    })
    const person = schedule.roster.find((member) => !member.isFloater)!
    const request = {
      personnelId: person.id,
      type: "excuse",
      startDate: "2026-09-16",
      endDate: "2026-09-17",
      note: "Taşınma",
    }
    const created = await http.post("/leaves", leaveSchema, { body: request })
    expect(created).toMatchObject({ status: "pending", days: 2 })
    expect(
      (await failure(http.post("/leaves", any, { body: request }))).fieldErrors
    ).toHaveProperty("startDate")
    expect(
      (
        await failure(
          http.post("/leaves", any, {
            body: {
              personnelId: person.id,
              type: "annual",
              startDate: "2026-10-01",
              endDate: "2026-12-31",
            },
          })
        )
      ).fieldErrors?.endDate?.[0]
    ).toMatch(/bakiyesi yetersiz/)
    expect(
      (
        await failure(
          http.post(`/leaves/${created.id}/decision`, any, {
            body: { decision: "reject" },
          })
        )
      ).fieldErrors
    ).toHaveProperty("note")

    const decided = await http.post(
      `/leaves/${created.id}/decision`,
      leaveDecisionResultSchema,
      {
        body: { decision: "approve" },
      }
    )
    expect(decided.leave.status).toBe("approved")
    expect(decided.removedShifts).toBeGreaterThan(0)
    expect(
      (
        await failure(
          http.post(`/leaves/${created.id}/decision`, any, {
            body: { decision: "approve" },
          })
        )
      ).status
    ).toBe(409)
    const after = await http.get("/schedule", locationScheduleSchema, {
      params: { locationId, from: MONDAY, to: addDaysIso(MONDAY, 6) },
    })
    expect(after.version).toBeGreaterThan(schedule.version)
    expect(
      after.assignments.some(
        (item) => item.personnelId === person.id && item.date === "2026-09-16"
      )
    ).toBe(false)
    const sick = await http.post("/leaves", leaveSchema, {
      body: {
        personnelId: person.id,
        type: "sick_report",
        startDate: "2026-09-21",
        endDate: "2026-09-21",
        note: "tanı",
      },
    })
    expect(sick.note).toBeNull()
    const cancelled = await http.post(`/leaves/${sick.id}/cancel`, leaveSchema)
    expect(cancelled.status).toBe("cancelled")
    const balance = await http.get(`/personnel/${person.id}/leave-balance`, any)
    expect(balance).toHaveProperty("entitlement")
  })
})

describe("Faz 2 mock API: puantaj ve bordro", () => {
  it("TC-2.5-03 kilitli dönemde düzenleme 409 PERIOD_LOCKED; yetkisiz geçiş 403, geçersiz 409", async () => {
    applyTestScenario("period-locked")
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    signIn("temizlik-orta", "bolge")
    const periods = await http.get(
      "/timesheet/periods",
      timesheetPeriodListSchema
    )
    const september = periods.items.find((item) => item.month === "2026-09")!
    expect(september.status).toBe("locked")
    expect(september.availableActions).toEqual([])
    const grid = await http.get(
      `/timesheet/periods/${september.id}/rows`,
      timesheetGridSchema,
      {
        params: {
          orgUnitId: db.orgUnits.findFirst(
            (unit) => unit.tenantId === "temizlik-orta"
          )!.id,
        },
      }
    )
    const row = grid.rows[0]!
    const locked = await failure(
      http.patch(`/timesheet/periods/${september.id}/cells`, any, {
        body: {
          personnelId: row.personnelId,
          date: "2026-09-15",
          code: "D",
          overtimeHours: 0,
        },
      })
    )
    expect(locked).toMatchObject({
      status: 409,
      code: "PERIOD_LOCKED",
      message: "Dönem kilitli; puantaj düzenlenemez.",
    })
    const october = periods.items.find((item) => item.month === "2026-10")!
    expect(
      (
        await failure(
          http.post(`/timesheet/periods/${october.id}/transition`, any, {
            body: { action: "approve_hr" },
          })
        )
      ).status
    ).toBe(403)
    expect(
      (
        await failure(
          http.post(`/timesheet/periods/${october.id}/transition`, any, {
            body: { action: "nope" },
          })
        )
      ).status
    ).toBe(422)
    signIn("temizlik-orta", "ik")
    expect(
      (
        await failure(
          http.post(`/timesheet/periods/${october.id}/transition`, any, {
            body: { action: "approve_hr" },
          })
        )
      ).code
    ).toBe("INVALID_TRANSITION")
  })

  it("onay sonrası düzeltme fark listesine düşer; İK onaylı dönemde düzenleme kapanır", async () => {
    applyTestScenario("month-end-close")
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    signIn("temizlik-orta", "bolge")
    const id = "tsp-le-temizlik-orta-1-2026-09"
    await http.post(
      `/timesheet/periods/${id}/transition`,
      timesheetPeriodSchema,
      { body: { action: "approve_region" } }
    )
    const grid = await http.get(
      `/timesheet/periods/${id}/rows`,
      timesheetGridSchema,
      { params: { q: "S00002" } }
    )
    const cell = await http.patch(`/timesheet/periods/${id}/cells`, any, {
      body: {
        personnelId: grid.rows[0]!.personnelId,
        date: "2026-09-15",
        code: "FM",
        overtimeHours: 2.5,
      },
    })
    expect(cell).toMatchObject({
      code: "FM",
      overtimeHours: 2.5,
      overridden: true,
    })
    const period = await http.get(
      `/timesheet/periods/${id}`,
      timesheetPeriodSchema
    )
    expect(period.changes[0]).toMatchObject({
      date: "2026-09-15",
      after: "FM",
      actor: "Elif Kaya",
    })
    signIn("temizlik-orta", "ik")
    await http.post(`/timesheet/periods/${id}/transition`, any, {
      body: { action: "approve_hr" },
    })
    signIn("temizlik-orta", "bolge")
    expect(
      (
        await failure(
          http.patch(`/timesheet/periods/${id}/cells`, any, {
            body: {
              personnelId: grid.rows[0]!.personnelId,
              date: "2026-09-16",
              code: "N",
              overtimeHours: 0,
            },
          })
        )
      ).message
    ).toMatch(/yeniden açın/)
  })

  it("TC-2.6-06 iki tüzel kişilik, iki farklı profil: kendi dosya biçimi ve kodlaması", async () => {
    applyTestScenario("month-end-close")
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    // Personel temini hattını kapat: bu testte müşteri onayı adımı yok
    for (const location of db.locations.findMany(
      (item) => item.tenantId === "cok-hatli-grup"
    )) {
      db.locations.update(location.id, {
        serviceLines: location.serviceLines.filter(
          (line) => line !== "staffing"
        ),
      })
    }
    signIn("cok-hatli-grup", "admin")
    const profiles = await http.get(
      "/payroll/profiles",
      payrollProfileListSchema
    )
    const logo = profiles.items.find(
      (item) => item.libraryKey === "logo-bordro-plus"
    )!
    const generic = profiles.items.find(
      (item) => item.libraryKey === "generic-csv"
    )!
    expect(logo.legalEntityIds).toEqual([
      "le-cok-hatli-grup-1",
      "le-cok-hatli-grup-3",
    ])
    expect(generic.legalEntityIds).toEqual(["le-cok-hatli-grup-2"])

    const exportPeriod = async (legalEntityId: string, profileId: string) => {
      const id = `tsp-${legalEntityId}-2026-09`
      expect(
        (
          await failure(
            http.post("/payroll-exports", any, {
              body: { periodId: id, profileId },
            })
          )
        ).code
      ).toBe("PERIOD_NOT_APPROVED")
      await http.post(`/timesheet/periods/${id}/transition`, any, {
        body: { action: "approve_region" },
      })
      await http.post(`/timesheet/periods/${id}/transition`, any, {
        body: { action: "approve_hr" },
      })
      const preview = await http.post(
        "/payroll-exports/preview",
        payrollPreviewSchema,
        { body: { periodId: id, profileId } }
      )
      expect(preview.errorRows).toBe(0)
      const record = await http.post("/payroll-exports", payrollExportSchema, {
        body: { periodId: id, profileId },
      })
      const file = await http.getBlob(`/payroll-exports/${record.id}/file`)
      return { record, file, preview }
    }

    const first = await exportPeriod("le-cok-hatli-grup-1", logo.id)
    expect(first.record).toMatchObject({
      format: "xlsx",
      fileName: "puantaj-çınar-2026-09.xlsx",
    })
    expect(first.file.filename).toBe("puantaj-çınar-2026-09.xlsx")
    const workbook = XLSX.read(await first.file.blob.arrayBuffer(), {
      type: "array",
    })
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[workbook.SheetNames[0]!]!,
      { header: 1 }
    )
    expect(matrix[0]?.slice(0, 8)).toEqual([
      "Sicil No",
      "T.C. Kimlik No",
      "Adı",
      "Soyadı",
      "Dönem Yılı",
      "Dönem Ayı",
      "Bölüm / Lokasyon Kodu",
      "Çalışılan Gün",
    ])
    const firstRow = matrix[1] as number[]
    expect(firstRow.slice(7, 15).reduce((sum, value) => sum + value, 0)).toBe(
      30
    )

    const second = await exportPeriod("le-cok-hatli-grup-2", generic.id)
    expect(second.record).toMatchObject({ format: "csv", encoding: "utf-8" })
    const bytes = new Uint8Array(await second.file.blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(second.preview.headers).toContain("Gün 30")

    const history = await http.get("/payroll-exports", any)
    expect(
      (history as { items: { profileName: string }[] }).items
        .map((item) => item.profileName)
        .sort()
    ).toEqual([generic.name, logo.name].sort())
  })

  it("TC-2.6-05 profil çoğaltılır, kod eşlemesi düzenlenir; Windows-1254 CSV üretilir", async () => {
    applyTestScenario("month-end-close")
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    signIn("temizlik-orta", "ik")
    const profiles = await http.get(
      "/payroll/profiles",
      payrollProfileListSchema
    )
    const logo = profiles.items.find(
      (item) => item.libraryKey === "logo-bordro-plus"
    )!
    expect(
      (
        await failure(
          http.put(`/payroll/profiles/${logo.id}`, any, { body: logo })
        )
      ).code
    ).toBe("LIBRARY_PROFILE")
    const copy = (await http.post("/payroll/profiles", any, {
      body: { sourceProfileId: logo.id, name: "Logo CSV" },
    })) as { id: string }
    const {
      id: _id,
      libraryKey: _key,
      simulated: _simulated,
      updatedAt: _updated,
      legalEntityIds: _le,
      ...settings
    } = logo
    await http.put(`/payroll/profiles/${copy.id}`, any, {
      body: { ...settings, name: "Logo CSV", format: "csv" },
    })
    await http.put("/legal-entities/le-temizlik-orta-1/payroll-profile", any, {
      body: { profileId: copy.id },
    })
    expect(
      (
        await failure(
          http.delete(`/payroll/profiles/${copy.id}`, z.undefined())
        )
      ).code
    ).toBe("PROFILE_IN_USE")
    signIn("temizlik-orta", "admin")
    const id = "tsp-le-temizlik-orta-1-2026-09"
    await http.post(`/timesheet/periods/${id}/transition`, any, {
      body: { action: "approve_region" },
    })
    await http.post(`/timesheet/periods/${id}/transition`, any, {
      body: { action: "approve_hr" },
    })
    await http.post(`/timesheet/periods/${id}/transition`, any, {
      body: { action: "lock" },
    })
    const record = await http.post("/payroll-exports", payrollExportSchema, {
      body: { periodId: id, profileId: copy.id },
    })
    expect(record).toMatchObject({
      profileName: "Logo CSV",
      format: "csv",
      encoding: "windows-1254",
    })
    const file = await http.getBlob(`/payroll-exports/${record.id}/file`)
    const text = decodeWindows1254(
      new Uint8Array(await file.blob.arrayBuffer())
    )
    expect(text.split("\r\n")[0]).toBe(
      "Sicil No;T.C. Kimlik No;Adı;Soyadı;Dönem Yılı;Dönem Ayı;Bölüm / Lokasyon Kodu;Çalışılan Gün;Hafta Tatili;Genel Tatil;Yıllık İzin;Ücretsiz İzin;İstirahat (Rapor);Devamsızlık;Mazeret İzni;Fazla Mesai %50;Hafta Tatili Mesaisi;Genel Tatil Mesaisi;Gece Çalışması;Eksik Saat"
    )
    expect(
      db.auditEvents.findFirst(
        (event) => event.action === "Bordro dosyası üretildi"
      )?.details
    ).toMatch(/^Logo CSV/)
  })

  it("TC-2.5-06 personel temini dönemi müşteri onayı adımında bekler; portal kullanıcısı onaylar", async () => {
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    const customerId = (
      db.users.findById("u-temizlik-orta-musteri")!.scope as { ids: string[] }
    ).ids[0]!
    const location = db.locations.findFirst(
      (item) => item.customerId === customerId
    )!
    db.locations.update(location.id, { serviceLines: ["staffing"] })
    const person = db.personnel.findFirst(
      (item) => item.tenantId === "temizlik-orta" && item.status === "active"
    )!
    db.personnel.update(person.id, { homeLocationId: location.id })
    signIn("temizlik-orta", "bolge")
    const id = "tsp-le-temizlik-orta-1-2026-09"
    const approved = await http.post(
      `/timesheet/periods/${id}/transition`,
      timesheetPeriodSchema,
      { body: { action: "approve_region" } }
    )
    expect(approved).toMatchObject({
      status: "region_approved",
      customerApprovalRequired: true,
    })
    signIn("temizlik-orta", "ik")
    expect(
      (await http.get(`/timesheet/periods/${id}`, timesheetPeriodSchema))
        .availableActions
    ).toEqual(["reopen"])
    signIn("temizlik-orta", "musteri")
    const pending = await http.get(
      "/portal/timesheet-approvals",
      timesheetPeriodListSchema
    )
    expect(pending.items.map((item) => item.id)).toContain(id)
    await http.post(`/timesheet/periods/${id}/transition`, any, {
      body: { action: "approve_customer" },
    })
    signIn("temizlik-orta", "ik")
    const after = await http.get(
      `/timesheet/periods/${id}`,
      timesheetPeriodSchema
    )
    expect(after.status).toBe("customer_approved")
    expect(after.availableActions).toContain("approve_hr")
  })
})
