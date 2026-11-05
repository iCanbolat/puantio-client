import { describe, expect, it } from "vitest"

import { DEFAULT_LABOR_RULES } from "@/entities/tenant"
import type { LocationSchedule, ShiftTemplate } from "@/entities/shift"
import { istanbulDateTime } from "@/shared/lib/work-time"

import {
  buildBoard,
  cellShiftId,
  expandRotation,
  templateInterval,
} from "./board"
import {
  evaluateSchedule,
  hasBlockingViolation,
  violationsByShift,
  type RuleShift,
} from "./rules"

const shift = (
  id: string,
  date: string,
  start: string,
  end: string,
  options: {
    personnelId?: string
    breakMinutes?: number
    endDate?: string
  } = {}
): RuleShift => ({
  id,
  personnelId: options.personnelId ?? "p1",
  date,
  startsAt: istanbulDateTime(date, start).getTime(),
  endsAt: istanbulDateTime(options.endDate ?? date, end).getTime(),
  breakMinutes: options.breakMinutes ?? 30,
})

const rules = { rules: DEFAULT_LABOR_RULES }
const codes = (list: ReturnType<typeof evaluateSchedule>) =>
  list.map((item) => item.code)

describe("Batch 2.1 kural motoru", () => {
  it("TC-2.1-01 aynı kişiye çakışan iki vardiya: engelleyici çakışma ihlali", () => {
    const violations = evaluateSchedule(
      [
        shift("a", "2026-09-14", "07:00", "15:00"),
        shift("b", "2026-09-14", "11:00", "19:00"),
      ],
      [],
      rules
    )
    expect(codes(violations)).toContain("overlap")
    expect(hasBlockingViolation(violations)).toBe(true)
    expect(violationsByShift(violations).get("b")?.[0]?.message).toMatch(
      /Çakışan vardiya/
    )
  })

  it("TC-2.1-02 haftalık 45 saati aşan atama uyarı + açıklama üretir", () => {
    // 6 gün × 8,5 net saat = 51 saat
    const week = ["14", "15", "16", "17", "18", "19"].map((day) =>
      shift(`d${day}`, `2026-09-${day}`, "07:00", "16:00")
    )
    const violations = evaluateSchedule(week, [], rules)
    const weekly = violations.find((item) => item.code === "weekly_limit")
    expect(weekly?.severity).toBe("warn")
    expect(weekly?.message).toBe(
      "2026-09-14 haftası: 51 saat planlandı; haftalık 45 saati 6 saat aşıyor (fazla mesai)."
    )
    expect(hasBlockingViolation(violations)).toBe(false)
  })

  it("TC-2.1-03 23:00 bitişli vardiya sonrası 07:00 vardiyası: 11 saat dinlenme ihlali", () => {
    const violations = evaluateSchedule(
      [
        shift("aksam", "2026-09-14", "15:00", "23:00"),
        shift("sabah", "2026-09-15", "07:00", "15:00"),
      ],
      [],
      rules
    )
    const rest = violations.find((item) => item.code === "rest_period")
    expect(rest?.shiftIds).toEqual(["aksam", "sabah"])
    expect(rest?.message).toMatch(/Dinlenme süresi 8 saat/)
  })

  it("TC-2.1-04 onaylı izinli kişiye atama engellenir; bekleyen talep yalnız uyarı", () => {
    const leave = {
      personnelId: "p1",
      startDate: "2026-09-15",
      endDate: "2026-09-16",
      typeLabel: "Yıllık izin",
    }
    const approved = evaluateSchedule(
      [shift("x", "2026-09-15", "07:00", "15:00")],
      [{ ...leave, status: "approved" }],
      rules
    )
    expect(approved[0]?.code).toBe("on_leave")
    expect(hasBlockingViolation(approved)).toBe(true)
    const pending = evaluateSchedule(
      [shift("x", "2026-09-15", "07:00", "15:00")],
      [{ ...leave, status: "pending" }],
      rules
    )
    expect(pending[0]?.code).toBe("pending_leave")
    expect(hasBlockingViolation(pending)).toBe(false)
  })

  it("günlük 11 saat, 7 günde 24 saat tatil ve yıllık fazla mesai sınırı", () => {
    const long = evaluateSchedule(
      [shift("l", "2026-09-14", "06:00", "19:00", { breakMinutes: 60 })],
      [],
      rules
    )
    expect(codes(long)).toContain("daily_limit")

    const everyDay = ["14", "15", "16", "17", "18", "19", "20"].map((day) =>
      shift(`n${day}`, `2026-09-${day}`, "07:00", "13:00")
    )
    expect(codes(evaluateSchedule(everyDay, [], rules))).toContain(
      "weekly_rest"
    )

    const heavy = ["14", "15", "16", "17", "18", "19"].map((day) =>
      shift(`h${day}`, `2026-09-${day}`, "07:00", "17:00")
    )
    const annual = evaluateSchedule(heavy, [], {
      rules: DEFAULT_LABOR_RULES,
      overtimeHoursYtd: new Map([["p1", 265]]),
    })
    expect(codes(annual)).toContain("annual_overtime")
  })

  it("normal 6 × 7,5 saatlik hafta ihlal üretmez; kişiler birbirini etkilemez", () => {
    const normal = ["14", "15", "16", "17", "18", "19"].flatMap((day) => [
      shift(`a${day}`, `2026-09-${day}`, "07:00", "15:00"),
      shift(`b${day}`, `2026-09-${day}`, "07:00", "15:00", {
        personnelId: "p2",
      }),
    ])
    expect(evaluateSchedule(normal, [], rules)).toEqual([])
  })
})

const template = (
  id: string,
  code: string,
  segments: ShiftTemplate["segments"],
  breakMinutes = 30
): ShiftTemplate =>
  ({
    id,
    code,
    name: code,
    kind: segments.length > 1 ? "split" : "standard",
    segments,
    breakMinutes,
    color: "sky",
    rotation: null,
    isActive: true,
  }) as ShiftTemplate

describe("Batch 2.1 pano", () => {
  const sabah = template("tpl-s", "S", [{ start: "07:00", end: "15:00" }])
  const parcali = template(
    "tpl-p",
    "P",
    [
      { start: "07:00", end: "11:00" },
      { start: "16:00", end: "20:00" },
    ],
    0
  )
  const templates = new Map([
    [sabah.id, sabah],
    [parcali.id, parcali],
  ])

  it("parçalı vardiyada aradaki boşluk mola sayılır", () => {
    const interval = templateInterval("2026-09-14", parcali)
    expect(interval?.breakMinutes).toBe(300)
    expect(
      templateInterval("2026-09-14", { segments: [], breakMinutes: 0 })
    ).toBeNull()
  })

  it("taslak sunucu atamasının yerine geçer; başka lokasyon ataması kurallara dahil olur", () => {
    const schedule = {
      location: {
        id: "loc-1",
        code: "L1",
        name: "Lokasyon",
        targetHeadcount: 2,
      },
      from: "2026-09-14",
      to: "2026-09-20",
      version: 0,
      roster: [
        {
          id: "p1",
          name: "A",
          employeeNumber: "1",
          position: "cleaner",
          isFloater: false,
          overtimeHoursYtd: 0,
        },
      ],
      assignments: [
        {
          id: "sh-p1-2026-09-14",
          personnelId: "p1",
          locationId: "loc-1",
          locationName: "Lokasyon",
          date: "2026-09-14",
          templateId: "tpl-s",
          code: "S",
          startsAt: istanbulDateTime("2026-09-14", "07:00").toISOString(),
          endsAt: istanbulDateTime("2026-09-14", "15:00").toISOString(),
          breakMinutes: 30,
          kind: "regular",
        },
        {
          id: "sh-p1-2026-09-15",
          personnelId: "p1",
          locationId: "loc-2",
          locationName: "Diğer",
          date: "2026-09-15",
          templateId: "tpl-s",
          code: "S",
          startsAt: istanbulDateTime("2026-09-15", "07:00").toISOString(),
          endsAt: istanbulDateTime("2026-09-15", "15:00").toISOString(),
          breakMinutes: 30,
          kind: "regular",
        },
      ],
      leaves: [
        {
          id: "lv",
          personnelId: "p1",
          type: "annual",
          typeLabel: "Yıllık izin",
          startDate: "2026-09-17",
          endDate: "2026-09-17",
          status: "approved",
        },
      ],
      holidays: [],
    } as unknown as LocationSchedule
    const board = buildBoard(
      schedule,
      ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"],
      { "p1|2026-09-14": null, "p1|2026-09-15": "tpl-s" },
      templates
    )
    expect(board.cells.get("p1|2026-09-14")).toMatchObject({
      code: null,
      draft: true,
    })
    expect(board.cells.get("p1|2026-09-15")?.elsewhere?.locationName).toBe(
      "Diğer"
    )
    expect(board.cells.get("p1|2026-09-17")?.leave).toEqual({
      typeLabel: "Yıllık izin",
      status: "approved",
    })
    const violations = evaluateSchedule(
      board.ruleShifts,
      board.ruleLeaves,
      rules
    )
    const overlap = violations.find((item) => item.code === "overlap")
    expect(overlap?.shiftIds).toContain(cellShiftId("p1", "2026-09-15"))
    expect(
      board.ruleShifts.some(
        (item) => item.id === cellShiftId("p1", "2026-09-14")
      )
    ).toBe(false)
  })

  it("rotasyon günlere sırayla yayılır (2 gündüz – 2 gece – 2 izin)", () => {
    const rotation = {
      rotation: [
        { kind: "shift" as const, templateId: "g" as ShiftTemplate["id"] },
        { kind: "shift" as const, templateId: "g" as ShiftTemplate["id"] },
        { kind: "shift" as const, templateId: "n" as ShiftTemplate["id"] },
        { kind: "shift" as const, templateId: "n" as ShiftTemplate["id"] },
        { kind: "off" as const },
        { kind: "off" as const },
      ],
    }
    const days = ["1", "2", "3", "4", "5", "6", "7"].map(
      (day) => `2026-09-0${day}`
    )
    expect([...expandRotation(rotation, days).values()]).toEqual([
      "g",
      "g",
      "n",
      "n",
      null,
      null,
      "g",
    ])
    expect([...expandRotation(rotation, days, 2).values()][0]).toBe("n")
    expect(expandRotation({ rotation: null }, days).size).toBe(0)
  })
})
