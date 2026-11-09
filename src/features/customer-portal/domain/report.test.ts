import { describe, expect, it } from "vitest"

import { buildMonthlyReport } from "./report"
import { issuesForSelection } from "./request"

describe("portal domain", () => {
  it("TC-4.5-02 aylık rapor: ay sınırı İstanbul saatiyle; kapanan, süresinde, ay sonunda açık", () => {
    const report = buildMonthlyReport({
      month: "2026-09",
      workOrders: [
        // 30 Eylül 23:30 İstanbul = UTC 20:30 → Eylül
        {
          source: "qr_feedback",
          priority: "high",
          status: "verified",
          createdAt: "2026-09-30T23:30:00+03:00",
          dueAt: "2026-10-01T03:30:00+03:00",
          completedAt: "2026-09-30T23:50:00+03:00",
        },
        // 1 Ekim 00:30 İstanbul (UTC 30 Eylül 21:30) → Ekim; ay sonunda açık sayılmaz
        {
          source: "manual",
          priority: "low",
          status: "new",
          createdAt: "2026-10-01T00:30:00+03:00",
          dueAt: "2026-10-04T00:30:00+03:00",
          completedAt: null,
        },
        {
          source: "customer_request",
          priority: "normal",
          status: "completed",
          createdAt: "2026-09-10T10:00:00+03:00",
          dueAt: "2026-09-11T10:00:00+03:00",
          completedAt: "2026-09-12T10:00:00+03:00",
        },
        {
          source: "manual",
          priority: "normal",
          status: "cancelled",
          createdAt: "2026-09-11T10:00:00+03:00",
          dueAt: "2026-09-12T10:00:00+03:00",
          completedAt: null,
        },
      ],
      audits: [
        {
          locationId: "b",
          locationName: "Şube B",
          score: 80,
          passed: true,
          criticalFailures: 0,
          performedAt: "2026-09-05T10:00:00+03:00",
        },
        {
          locationId: "a",
          locationName: "Şube A",
          score: 71,
          passed: false,
          criticalFailures: 2,
          performedAt: "2026-09-06T10:00:00+03:00",
        },
        {
          locationId: "a",
          locationName: "Şube A",
          score: 90,
          passed: true,
          criticalFailures: 0,
          performedAt: "2026-10-06T10:00:00+03:00",
        },
      ],
    })
    expect(report.workOrders).toEqual({
      opened: 3,
      closed: 2,
      onTime: 1,
      slaRate: 0.5,
      averageResolutionMinutes: (20 + 48 * 60) / 2,
      openAtMonthEnd: 0,
      bySource: {
        qr_feedback: 1,
        audit_critical: 0,
        manual: 1,
        customer_request: 1,
      },
      byPriority: { urgent: 0, high: 1, normal: 2, low: 0 },
    })
    expect(report.audits).toEqual({
      count: 2,
      average: 75.5,
      passed: 1,
      criticalFailures: 2,
      byLocation: [
        { locationId: "a", locationName: "Şube A", count: 1, average: 71 },
        { locationId: "b", locationName: "Şube B", count: 1, average: 80 },
      ],
    })
  })

  it("talep formu sorunları: alan tipi × lokasyon hizmet hatları, uyan yoksa 'Diğer'", () => {
    const options = {
      locations: [
        {
          id: "l1",
          code: "L1",
          name: "Şube",
          serviceLines: ["cleaning" as const],
          areas: [
            { id: "wc", name: "WC", type: "restroom" as const },
            { id: "park", name: "Otopark", type: "parking" as const },
          ],
        },
      ],
      issues: [
        {
          code: "soap",
          label: "Sabun yok",
          serviceLine: "cleaning" as const,
          areaTypes: ["restroom" as const],
        },
        {
          code: "hvac",
          label: "Klima",
          serviceLine: "technical" as const,
          areaTypes: ["restroom" as const],
        },
        {
          code: "other",
          label: "Diğer",
          serviceLine: "cleaning" as const,
          areaTypes: ["other" as const],
        },
      ],
    }
    expect(
      issuesForSelection(options, "l1", "wc").map((item) => item.code)
    ).toEqual(["soap"])
    expect(
      issuesForSelection(options, "l1", "park").map((item) => item.code)
    ).toEqual(["other"])
    expect(issuesForSelection(options, "yok", null)).toEqual([])
  })
})
