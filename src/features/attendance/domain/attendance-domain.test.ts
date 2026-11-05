import { describe, expect, it } from "vitest"

import { istanbulDateTime } from "@/shared/lib/work-time"

import { detectAnomalies, type AnomalyEvent } from "./anomalies"
import { rankBackupCandidates } from "./backup"
import {
  alarmCreatedAt,
  alarmDueAt,
  deriveAttendanceStatus,
  lateMinutes,
  shouldEscalate,
} from "./status"

const at = (time: string, date = "2026-09-14") => istanbulDateTime(date, time)

describe("Batch 2.3 yoklama durumu ve alarm zamanları", () => {
  const shift = {
    startsAt: at("07:00"),
    endsAt: at("15:00"),
    hasBackup: false,
    toleranceMinutes: 10,
  }

  it("tolerans içinde giriş yoksa Gelmedi, sonra giriş Geç, yedek varsa Yedek atandı", () => {
    expect(
      deriveAttendanceStatus({
        ...shift,
        checkIn: null,
        checkOut: null,
        now: at("07:05"),
      })
    ).toBe("expected")
    expect(
      deriveAttendanceStatus({
        ...shift,
        checkIn: null,
        checkOut: null,
        now: at("07:10"),
      })
    ).toBe("no_show")
    expect(
      deriveAttendanceStatus({
        ...shift,
        checkIn: at("07:08"),
        checkOut: null,
        now: at("07:30"),
      })
    ).toBe("checked_in")
    expect(
      deriveAttendanceStatus({
        ...shift,
        checkIn: at("07:25"),
        checkOut: null,
        now: at("07:30"),
      })
    ).toBe("late")
    expect(
      deriveAttendanceStatus({
        ...shift,
        hasBackup: true,
        checkIn: null,
        checkOut: null,
        now: at("07:30"),
      })
    ).toBe("backup_assigned")
    expect(
      deriveAttendanceStatus({
        ...shift,
        checkIn: at("07:00"),
        checkOut: at("15:00"),
        now: at("16:00"),
      })
    ).toBe("checked_out")
    expect(lateMinutes(at("07:00"), at("07:25"))).toBe(25)
    expect(lateMinutes(at("07:00"), at("06:50"))).toBe(0)
    expect(lateMinutes(at("07:00"), null)).toBe(0)
  })

  it("alarm anı = başlangıç + tolerans, SLA ve eskalasyon süreleri", () => {
    const created = alarmCreatedAt(at("07:00"), 10)
    expect(created).toEqual(at("07:10"))
    expect(alarmDueAt(created, 15)).toEqual(at("07:25"))
    expect(shouldEscalate(created, at("07:24"), 15)).toBe(false)
    expect(shouldEscalate(created, at("07:25"), 15)).toBe(true)
  })
})

const event = (patch: Partial<AnomalyEvent>): AnomalyEvent => ({
  kind: "in",
  deviceTime: at("07:00"),
  receivedAt: at("07:00"),
  offline: false,
  inside: true,
  distanceMeters: 20,
  ...patch,
})

describe("Batch 2.4 anomali bayrakları", () => {
  it("TC-2.4-01 geofence dışı check-in (480 m): bayrak ve mesafe", () => {
    const anomalies = detectAnomalies({
      endsAt: at("15:00"),
      now: at("08:00"),
      events: [event({ inside: false, distanceMeters: 480 })],
    })
    expect(anomalies).toEqual([{ code: "outside_geofence", detail: "480 m" }])
  })

  it("eksik çıkış, çift giriş, cihaz saati sapması ve geç senkron", () => {
    const anomalies = detectAnomalies({
      endsAt: at("15:00"),
      now: at("18:00"),
      events: [
        event({ deviceTime: at("07:10"), receivedAt: at("07:00") }),
        event({ deviceTime: at("07:02"), receivedAt: at("07:02") }),
      ],
    })
    expect(anomalies.map((item) => item.code)).toEqual([
      "missing_checkout",
      "duplicate_checkin",
      "clock_skew",
    ])
    expect(anomalies.find((item) => item.code === "clock_skew")?.detail).toBe(
      "10 dk ileri"
    )
    const late = detectAnomalies({
      endsAt: at("15:00"),
      now: at("12:00"),
      events: [event({ offline: true, receivedAt: at("10:30") })],
    })
    expect(late).toEqual([
      { code: "late_sync", detail: "3 sa 30 dk sonra ulaştı" },
    ])
    // Vardiya bitiminden 2 saat geçmeden eksik çıkış sayılmaz
    expect(
      detectAnomalies({
        endsAt: at("15:00"),
        now: at("16:00"),
        events: [event({})],
      })
    ).toEqual([])
  })
})

describe("Batch 2.3 yedek önerisi", () => {
  it("TC-2.3-03 öneriler mesafeye göre sıralı; meşgul ve izinli olanlar çıkar", () => {
    const target = { lat: 41.0, lng: 29.0 }
    const ranked = rankBackupCandidates(target, [
      {
        personnelId: "far",
        isFloater: true,
        position: { lat: 41.2, lng: 29.0 },
        busy: false,
        onLeave: false,
      },
      {
        personnelId: "near",
        isFloater: false,
        position: { lat: 41.01, lng: 29.0 },
        busy: false,
        onLeave: false,
      },
      {
        personnelId: "busy",
        isFloater: true,
        position: { lat: 41.0, lng: 29.0 },
        busy: true,
        onLeave: false,
      },
      {
        personnelId: "leave",
        isFloater: true,
        position: { lat: 41.0, lng: 29.0 },
        busy: false,
        onLeave: true,
      },
      {
        personnelId: "unknown",
        isFloater: true,
        position: null,
        busy: false,
        onLeave: false,
      },
      {
        personnelId: "nearFloater",
        isFloater: true,
        position: { lat: 41.01, lng: 29.0 },
        busy: false,
        onLeave: false,
      },
    ])
    expect(ranked.map((item) => item.personnelId)).toEqual([
      "nearFloater",
      "near",
      "far",
      "unknown",
    ])
    expect(ranked[0]?.distanceKm).toBe(1.1)
    expect(rankBackupCandidates(target, [], 3)).toEqual([])
  })
})
