import { describe, expect, it } from "vitest"

import { decodeWindows1254, encodeText, encodeWindows1254 } from "./encoding"
import {
  addDaysIso,
  addMonths,
  diffIsoDays,
  eachIsoDate,
  isTimeOfDay,
  istanbulDateTime,
  isoWeekday,
  minutesOfDay,
  monthOf,
  monthRange,
  nightMinutes,
  overlapMs,
  roundToHalfHour,
  segmentInterval,
  segmentMinutes,
  startOfIsoWeek,
} from "./work-time"

describe("Faz 2 ortak yardımcılar", () => {
  it("TC-2.6-01 Windows-1254: Türkçe harfler doğru kod sayfasına yazılır", () => {
    const bytes = encodeWindows1254("ŞĞİşğı")
    expect([...bytes]).toEqual([0xde, 0xd0, 0xdd, 0xfe, 0xf0, 0xfd])
    expect([...encodeWindows1254("Çç Öö Üü")]).toEqual([
      0xc7, 0xe7, 0x20, 0xd6, 0xf6, 0x20, 0xdc, 0xfc,
    ])
    expect([...encodeWindows1254("€…™")]).toEqual([0x80, 0x85, 0x99])
    // Karşılığı olmayan karakter "?" olur
    expect([...encodeWindows1254("Ж😀")]).toEqual([0x3f, 0x3f])
    // Latin-1'in Türkçe harflere ayrılan konumları başka karakterle doldurulmaz
    expect([...encodeWindows1254("Ð")]).toEqual([0x3f])
    expect(decodeWindows1254(encodeWindows1254("Şükrü Ağaoğlu İŞİ"))).toBe(
      "Şükrü Ağaoğlu İŞİ"
    )
  })

  it("UTF-8 kodlama isteğe bağlı BOM ekler", () => {
    expect([...encodeText("a", "utf-8", { bom: true })]).toEqual([
      0xef, 0xbb, 0xbf, 0x61,
    ])
    expect([...encodeText("ı", "utf-8")]).toEqual([0xc4, 0xb1])
    expect([...encodeText("ı", "windows-1254")]).toEqual([0xfd])
  })

  it("takvim günü aritmetiği saat diliminden bağımsızdır", () => {
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01")
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28")
    expect(isoWeekday("2026-09-14")).toBe(1)
    expect(isoWeekday("2026-09-20")).toBe(7)
    expect(startOfIsoWeek("2026-09-20")).toBe("2026-09-14")
    expect(eachIsoDate("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ])
    expect(diffIsoDays("2026-09-01", "2026-10-01")).toBe(30)
    expect(monthRange("2026-02")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
      days: 28,
    })
    expect(monthRange("2026-09").days).toBe(30)
    expect(addMonths("2026-01", -1)).toBe("2025-12")
    expect(addMonths("2026-12", 1)).toBe("2027-01")
    expect(monthOf("2026-09-14")).toBe("2026-09")
    expect(monthOf(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10")
    expect(() => monthRange("x")).toThrow(RangeError)
    expect(() => addDaysIso("bozuk", 1)).toThrow(RangeError)
  })

  it("saat ve vardiya aralıkları İstanbul saatine göre hesaplanır, gece geçişini taşır", () => {
    expect(isTimeOfDay("07:30")).toBe(true)
    expect(isTimeOfDay("24:00")).toBe(false)
    expect(minutesOfDay("07:30")).toBe(450)
    expect(() => minutesOfDay("7:3")).toThrow(RangeError)
    expect(istanbulDateTime("2026-09-14", "07:00").toISOString()).toBe(
      "2026-09-14T04:00:00.000Z"
    )
    const night = segmentInterval("2026-09-14", {
      start: "23:00",
      end: "07:00",
    })
    expect(night.end.toISOString()).toBe("2026-09-15T04:00:00.000Z")
    expect(segmentMinutes({ start: "23:00", end: "07:00" })).toBe(480)
    expect(segmentMinutes({ start: "07:00", end: "15:00" })).toBe(480)
  })

  it("gece çalışması 20:00–06:00 aralığından hesaplanır", () => {
    expect(
      nightMinutes(
        istanbulDateTime("2026-09-14", "19:00"),
        istanbulDateTime("2026-09-15", "07:00")
      )
    ).toBe(600)
    expect(
      nightMinutes(
        istanbulDateTime("2026-09-14", "07:00"),
        istanbulDateTime("2026-09-14", "15:00")
      )
    ).toBe(0)
    expect(overlapMs({ start: 0, end: 10 }, { start: 5, end: 20 })).toBe(5)
    expect(overlapMs({ start: 0, end: 10 }, { start: 15, end: 20 })).toBe(0)
    expect(roundToHalfHour(7.26)).toBe(7.5)
    expect(roundToHalfHour(7.2)).toBe(7)
  })
})
