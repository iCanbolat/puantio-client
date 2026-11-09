import { describe, expect, it } from "vitest"

import type { AuditSection } from "../model/audit"
import { planCompliance, planSlots } from "./plan"
import {
  scoreAudit,
  totalWeight,
  validateTemplate,
  workOrdersFromAudit,
} from "./scoring"

const sections: AuditSection[] = [
  {
    id: "s1",
    title: "Islak hacim",
    items: [
      {
        id: "a",
        text: "Lavabo temiz",
        type: "yes_no",
        weight: 30,
        critical: true,
        workOrderPriority: "high",
      },
      {
        id: "b",
        text: "Koku",
        type: "score_1_5",
        weight: 20,
        critical: false,
        workOrderPriority: "normal",
      },
    ],
  },
  {
    id: "s2",
    title: "Ekipman",
    items: [
      {
        id: "c",
        text: "Araba düzenli",
        type: "photo_required",
        weight: 50,
        critical: false,
        workOrderPriority: "normal",
      },
      {
        id: "d",
        text: "Gözlem",
        type: "note",
        weight: 0,
        critical: false,
        workOrderPriority: "normal",
      },
    ],
  },
]

const answer = (
  itemId: string,
  passed: boolean | null,
  score: number | null = null
) => ({
  itemId,
  passed,
  score,
})

describe("kalite domain", () => {
  it("TC-4.1-01 ağırlık toplamı ≠ 100 ise şablon geçersiz", () => {
    expect(totalWeight(sections)).toBe(100)
    expect(validateTemplate({ sections })).toEqual([])
    const broken = structuredClone(sections)
    broken[0]!.items[0]!.weight = 25
    expect(validateTemplate({ sections: broken })).toEqual([
      { path: "_weights", message: "Ağırlık toplamı 100 olmalı (şu an 95)" },
    ])
    // Boş bırakılan (NaN) ağırlık 0 sayılır
    broken[0]!.items[0]!.weight = Number.NaN
    expect(totalWeight(broken)).toBe(70)
    // Not maddesi puanlanmaz ve kritik olamaz; puanlı madde en az 1
    const rules = structuredClone(sections)
    rules[1]!.items[1]!.critical = true
    rules[1]!.items[1]!.weight = 5
    rules[0]!.items[1]!.weight = 0
    rules[0]!.items[0]!.weight = 50
    expect(
      validateTemplate({ sections: rules }).map((issue) => issue.path)
    ).toEqual([
      "sections.0.items.1.weight",
      "sections.1.items.1.weight",
      "sections.1.items.1.critical",
    ])
  })

  it("TC-4.2-02 ağırlıklı puan: 1–5 ölçeği 0–1'e normalize, uygulanamaz paydadan düşer", () => {
    const full = scoreAudit(
      sections,
      [answer("a", true), answer("b", null, 5), answer("c", true)],
      80
    )
    expect(full.score).toBe(100)
    expect(full.passed).toBe(true)
    // b=3 → 0,5 × 20 = 10; c hayır → 0 → (30 + 10) / 100
    const mixed = scoreAudit(
      sections,
      [answer("a", true), answer("b", null, 3), answer("c", false)],
      80
    )
    expect(mixed.score).toBe(40)
    expect(mixed.passed).toBe(false)
    expect(mixed.sectionScores).toEqual([
      { sectionId: "s1", score: 80 },
      { sectionId: "s2", score: 0 },
    ])
    // c uygulanamaz → payda 50: (30 + 0,75 × 20) / 50 = %90
    const na = scoreAudit(
      sections,
      [answer("a", true), answer("b", null, 4), answer("c", null)],
      80
    )
    expect(na.score).toBe(90)
    expect(na.sectionScores[1]).toEqual({ sectionId: "s2", score: null })
    // Cevapsız denetim 0 puan
    expect(scoreAudit(sections, [], 80).score).toBe(0)
    // Ondalık yuvarlama (bir hane): b=2 → (30 + 5 + 50) = 85; 1/3 benzeri durum
    const third = scoreAudit(
      [
        {
          id: "x",
          title: "X",
          items: [
            {
              id: "p",
              text: "p",
              type: "yes_no",
              weight: 1,
              critical: false,
              workOrderPriority: "normal",
            },
            {
              id: "q",
              text: "q",
              type: "yes_no",
              weight: 1,
              critical: false,
              workOrderPriority: "normal",
            },
            {
              id: "r",
              text: "r",
              type: "yes_no",
              weight: 1,
              critical: false,
              workOrderPriority: "normal",
            },
          ],
        },
      ],
      [answer("p", true), answer("q", false), answer("r", false)],
      80
    )
    expect(third.score).toBe(33.3)
  })

  it("TC-4.1-02 kritik madde başarısızsa puan yüksek olsa da denetim başarısız ve iş emri taslağı çıkar", () => {
    const result = scoreAudit(
      sections,
      [answer("a", false), answer("b", null, 5), answer("c", true)],
      60
    )
    expect(result.score).toBe(70)
    expect(result.criticalFailures).toEqual(["a"])
    expect(result.passed).toBe(false)
    expect(workOrdersFromAudit(sections, result.criticalFailures)).toEqual([
      { itemId: "a", title: "Denetim: Lavabo temiz", priority: "high" },
    ])
    // Puan maddesinde 1–2 kritik başarısızlıktır, 3 değildir
    const scored = structuredClone(sections)
    scored[0]!.items[1]!.critical = true
    expect(
      scoreAudit(scored, [answer("a", true), answer("b", null, 2)], 0)
        .criticalFailures
    ).toEqual(["b"])
    expect(
      scoreAudit(scored, [answer("a", true), answer("b", null, 3)], 0)
        .criticalFailures
    ).toEqual([])
  })

  it("TC-4.2-01 plan yuvaları ve gerçekleşme: haftalık, 2 haftalık, aylık", () => {
    // Pazartesi 1 Haziran'dan haftalık: Eylül'de 31 Ağu–6 Eyl (1–6 Eyl), 7–13, 14–20, 21–27, 28 Eyl–4 Eki (28–30)
    const weekly = planSlots("weekly", "2026-06-01", "2026-09")
    expect(weekly).toEqual([
      { from: "2026-09-01", to: "2026-09-06" },
      { from: "2026-09-07", to: "2026-09-13" },
      { from: "2026-09-14", to: "2026-09-20" },
      { from: "2026-09-21", to: "2026-09-27" },
      { from: "2026-09-28", to: "2026-09-30" },
    ])
    expect(planSlots("biweekly", "2026-06-01", "2026-09")).toHaveLength(3)
    expect(planSlots("monthly", "2026-09-10", "2026-09")).toEqual([
      { from: "2026-09-10", to: "2026-09-30" },
    ])
    expect(planSlots("weekly", "2026-10-01", "2026-09")).toEqual([])

    // 16 Eylül: ilk iki yuva bitti; biri yapıldı, biri eksik; üçüncü sürüyor
    const midMonth = new Date("2026-09-16T12:00:00+03:00")
    expect(
      planCompliance(weekly, ["2026-09-03", "2026-09-04"], midMonth)
    ).toEqual({
      planned: 5,
      done: 1,
      missing: 1,
      state: "late",
    })
    expect(
      planCompliance(weekly, ["2026-09-03", "2026-09-08"], midMonth)
    ).toEqual({
      planned: 5,
      done: 2,
      missing: 0,
      state: "on_track",
    })
    expect(
      planCompliance(
        weekly,
        ["2026-09-02", "2026-09-09", "2026-09-15", "2026-09-22", "2026-09-29"],
        midMonth
      )
    ).toMatchObject({ done: 5, state: "complete" })
  })
})
