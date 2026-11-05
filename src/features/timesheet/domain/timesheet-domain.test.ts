import { describe, expect, it } from "vitest"

import { istanbulDateTime } from "@/shared/lib/work-time"

import { computeDayCell, summarizeCells, type DayCellInput } from "./cell-code"
import {
  availablePeriodActions,
  isPeriodEditable,
  nextPeriodStatus,
  tracksChanges,
} from "./period"

const at = (date: string, time: string) => istanbulDateTime(date, time)
const DATE = "2026-09-15"
const NOW = at("2026-10-01", "10:00")

const base = (patch: Partial<DayCellInput> = {}): DayCellInput => ({
  date: DATE,
  now: NOW,
  employed: true,
  holiday: null,
  leaveType: null,
  shifts: [],
  override: null,
  ...patch,
})

const sabah = (
  checkIn: string | null,
  checkOut: string | null,
  date = DATE
) => ({
  startsAt: at(date, "07:00"),
  endsAt: at(date, "15:00"),
  breakMinutes: 30,
  checkIn: checkIn ? at(date, checkIn) : null,
  checkOut: checkOut ? at(date, checkOut) : null,
})

describe("Batch 2.5 puantaj kod motoru", () => {
  it("TC-2.5-01 vardiya + giriş + izin + tatil kombinasyonları için beklenen kod tablosu", () => {
    const table: [string, DayCellInput, string | null][] = [
      ["normal çalışma", base({ shifts: [sabah("06:55", "15:10")] }), "N"],
      ["2 saat fazla mesai", base({ shifts: [sabah("07:00", "17:00")] }), "FM"],
      ["vardiyaya gelmedi", base({ shifts: [sabah(null, null)] }), "D"],
      ["eksik çıkış", base({ shifts: [sabah("07:00", null)] }), "?"],
      ["vardiya yok (hafta tatili)", base(), "HT"],
      ["yıllık izin", base({ leaveType: "annual" }), "Yİ"],
      ["sağlık raporu", base({ leaveType: "sick_report" }), "R"],
      ["ücretsiz izin", base({ leaveType: "unpaid" }), "Üİ"],
      ["mazeret izni", base({ leaveType: "excuse" }), "Mİ"],
      ["doğum izni", base({ leaveType: "maternity" }), "Dİ"],
      ["idari izin", base({ leaveType: "administrative" }), "İİ"],
      ["resmi tatil", base({ holiday: { kind: "full" } }), "RT"],
      [
        "resmi tatilde yıllık izin → RT",
        base({ holiday: { kind: "full" }, leaveType: "annual" }),
        "RT",
      ],
      [
        "resmi tatilde rapor → R",
        base({ holiday: { kind: "full" }, leaveType: "sick_report" }),
        "R",
      ],
      ["istihdam dışı", base({ employed: false }), "-"],
      [
        "elle düzeltme",
        base({
          shifts: [sabah(null, null)],
          override: { code: "Mİ", overtimeHours: 0 },
        }),
        "Mİ",
      ],
      [
        "gelecek vardiya",
        base({ now: at(DATE, "06:00"), shifts: [sabah(null, null)] }),
        null,
      ],
      [
        "devam eden vardiya",
        base({ now: at(DATE, "10:00"), shifts: [sabah("07:00", null)] }),
        null,
      ],
    ]
    for (const [label, input, expected] of table) {
      expect(computeDayCell(input).code, label).toBe(expected)
    }
  })

  it("fazla mesai erken girişi saymaz, 1 saatten azını yazmaz, yarım saate aşağı yuvarlar", () => {
    expect(
      computeDayCell(base({ shifts: [sabah("06:30", "15:40")] })).overtimeHours
    ).toBe(0)
    expect(
      computeDayCell(base({ shifts: [sabah("07:00", "16:50")] })).overtimeHours
    ).toBe(1.5)
    const late = computeDayCell(base({ shifts: [sabah("07:45", "15:00")] }))
    expect(late).toMatchObject({ code: "N", missingHours: 0.5 })
  })

  it("TC-2.5-02 Ramazan Bayramı arefesi yarım gün: YG", () => {
    const cell = computeDayCell(
      base({
        date: "2026-03-19",
        holiday: { kind: "half" },
        shifts: [sabah("07:00", "15:00", "2026-03-19")],
      })
    )
    expect(cell.code).toBe("YG")
    expect(
      computeDayCell(base({ date: "2026-03-19", holiday: { kind: "half" } }))
        .code
    ).toBe("YG")
  })

  it("resmi tatilde çalışma genel tatil mesaisi, gece ve pazar çalışması ayrı yazılır", () => {
    const holidayWork = computeDayCell(
      base({ holiday: { kind: "full" }, shifts: [sabah("07:00", "15:00")] })
    )
    expect(holidayWork).toMatchObject({ code: "RT", holidayWorkHours: 7.5 })
    const nightShift = computeDayCell(
      base({
        shifts: [
          {
            startsAt: at(DATE, "19:00"),
            endsAt: at("2026-09-16", "07:00"),
            breakMinutes: 60,
            checkIn: at(DATE, "19:00"),
            checkOut: at("2026-09-16", "07:00"),
          },
        ],
      })
    )
    expect(nightShift).toMatchObject({ code: "N", nightHours: 10 })
    const sunday = computeDayCell(
      base({
        date: "2026-09-20",
        shifts: [sabah("07:00", "15:00", "2026-09-20")],
      })
    )
    expect(sunday.weeklyRestWorkHours).toBe(7.5)
  })

  it("satır özeti: çalışılan gün (YG yarım), FM saati, devamsızlık, belirsiz gün", () => {
    const summary = summarizeCells([
      { code: "N", overtimeHours: 0 },
      { code: "FM", overtimeHours: 2.5 },
      { code: "YG", overtimeHours: 0 },
      { code: "D", overtimeHours: 0 },
      { code: "Yİ", overtimeHours: 0 },
      { code: "?", overtimeHours: 0 },
      { code: null, overtimeHours: 0 },
      { code: "-", overtimeHours: 0 },
      { code: "HT", overtimeHours: 0 },
    ])
    expect(summary).toEqual({
      workedDays: 2.5,
      overtimeHours: 2.5,
      absenceDays: 1,
      leaveDays: 1,
      expectedDays: 8,
      unresolvedDays: 2,
    })
  })
})

describe("Batch 2.5 dönem yaşam döngüsü", () => {
  it("Açık → Bölge → (Müşteri) → İK → Kilitli; geçersiz geçiş null", () => {
    expect(nextPeriodStatus("open", "approve_region", false)).toBe(
      "region_approved"
    )
    expect(nextPeriodStatus("region_approved", "approve_hr", false)).toBe(
      "hr_approved"
    )
    expect(nextPeriodStatus("region_approved", "approve_hr", true)).toBeNull()
    expect(nextPeriodStatus("region_approved", "approve_customer", true)).toBe(
      "customer_approved"
    )
    expect(
      nextPeriodStatus("region_approved", "approve_customer", false)
    ).toBeNull()
    expect(nextPeriodStatus("customer_approved", "approve_hr", true)).toBe(
      "hr_approved"
    )
    expect(nextPeriodStatus("hr_approved", "lock", false)).toBe("locked")
    expect(nextPeriodStatus("locked", "reopen", false)).toBeNull()
    expect(nextPeriodStatus("hr_approved", "reopen", false)).toBe("open")
    expect(nextPeriodStatus("open", "lock", false)).toBeNull()
    expect(isPeriodEditable("locked")).toBe(false)
    expect(isPeriodEditable("region_approved")).toBe(true)
    expect(tracksChanges("open")).toBe(false)
    expect(tracksChanges("region_approved")).toBe(true)
  })

  it("TC-2.5-04 İK yetkisi olmayan kullanıcıya İK onayı sunulmaz", () => {
    const region = new Set(["timesheet:approve_region"] as const)
    expect(availablePeriodActions("region_approved", false, region)).toEqual([])
    const hr = new Set(["timesheet:approve_hr"] as const)
    expect(availablePeriodActions("region_approved", false, hr)).toEqual([
      "approve_hr",
      "reopen",
    ])
    expect(availablePeriodActions("open", false, region)).toEqual([
      "approve_region",
    ])
  })
})
