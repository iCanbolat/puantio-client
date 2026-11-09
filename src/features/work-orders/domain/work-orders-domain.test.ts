import { describe, expect, it } from "vitest"

import { DEFAULT_QUALITY_RULES } from "@/entities/tenant"

import type { WorkOrderStatus } from "../model/work-order"
import {
  actionForDrop,
  applyAction,
  availableActions,
  compareUrgency,
  dueAtFor,
  findMergeTarget,
  isBreached,
  slaCompliance,
} from "./workflow"

const NOW = Date.parse("2026-10-05T10:00:00+03:00")
const at = (minutesAgo: number) =>
  new Date(NOW - minutesAgo * 60_000).toISOString()

describe("iş emri domain", () => {
  it("TC-4.4-03 durum akışı: geçersiz geçişler engellenir, pano bırakması doğru eyleme dönüşür", () => {
    expect(applyAction("assign", "new")).toBe("assigned")
    // Yeniden atama durumu değiştirmez
    expect(applyAction("assign", "in_progress")).toBe("in_progress")
    expect(applyAction("start", "assigned")).toBe("in_progress")
    expect(applyAction("complete", "in_progress")).toBe("completed")
    expect(applyAction("verify", "completed")).toBe("verified")
    expect(applyAction("reopen", "completed")).toBe("in_progress")
    expect(applyAction("cancel", "assigned")).toBe("cancelled")
    // Geçersizler
    expect(applyAction("complete", "new")).toBeNull()
    expect(applyAction("verify", "in_progress")).toBeNull()
    expect(applyAction("cancel", "verified")).toBeNull()
    expect(availableActions("verified")).toEqual([])
    expect(availableActions("new")).toEqual(["assign", "cancel"])

    const drops: [WorkOrderStatus, WorkOrderStatus, string | null][] = [
      ["new", "assigned", "assign"],
      ["assigned", "in_progress", "start"],
      ["in_progress", "completed", "complete"],
      ["completed", "verified", "verify"],
      ["completed", "in_progress", "reopen"],
      ["new", "completed", null],
      ["new", "verified", null],
      ["verified", "new", null],
      ["assigned", "assigned", null],
    ]
    for (const [from, to, expected] of drops)
      expect(actionForDrop(from, to)).toBe(expected)
  })

  it("SLA son tarihi kiracı kuralındaki öncelik süresinden gelir", () => {
    const created = "2026-10-05T08:00:00+03:00"
    expect(dueAtFor(created, "urgent", DEFAULT_QUALITY_RULES)).toBe(
      "2026-10-05T06:00:00.000Z"
    )
    expect(dueAtFor(created, "high", DEFAULT_QUALITY_RULES)).toBe(
      "2026-10-05T09:00:00.000Z"
    )
    expect(dueAtFor(created, "normal", DEFAULT_QUALITY_RULES)).toBe(
      "2026-10-06T05:00:00.000Z"
    )
    expect(
      dueAtFor(created, "urgent", {
        slaMinutes: { ...DEFAULT_QUALITY_RULES.slaMinutes, urgent: 30 },
      })
    ).toBe("2026-10-05T05:30:00.000Z")
  })

  it("TC-4.4-02 SLA'sı aşılan açık iş emirleri en üstte, en çok geciken önce; kapananlar en sonda", () => {
    const items = [
      {
        id: "kapali",
        status: "verified" as const,
        priority: "urgent" as const,
        createdAt: at(30),
        dueAt: at(-30),
        completedAt: at(10),
      },
      {
        id: "zamaninda",
        status: "new" as const,
        priority: "normal" as const,
        createdAt: at(10),
        dueAt: at(-600),
        completedAt: null,
      },
      {
        id: "az-geciken",
        status: "assigned" as const,
        priority: "high" as const,
        createdAt: at(300),
        dueAt: at(60),
        completedAt: null,
      },
      {
        id: "cok-geciken",
        status: "in_progress" as const,
        priority: "urgent" as const,
        createdAt: at(180),
        dueAt: at(120),
        completedAt: null,
      },
      {
        id: "yakin",
        status: "new" as const,
        priority: "high" as const,
        createdAt: at(200),
        dueAt: at(-40),
        completedAt: null,
      },
    ]
    expect([...items].sort(compareUrgency(NOW)).map((item) => item.id)).toEqual(
      ["cok-geciken", "az-geciken", "yakin", "zamaninda", "kapali"]
    )
    expect(isBreached(items[3]!, NOW)).toBe(true)
    expect(isBreached(items[1]!, NOW)).toBe(false)
    // Süresinden sonra tamamlanan kapalı iş emri "gecikmeli" sayılır
    expect(
      isBreached(
        { status: "completed", dueAt: at(60), completedAt: at(10) },
        NOW
      )
    ).toBe(true)
    expect(
      isBreached({ status: "cancelled", dueAt: at(60), completedAt: null }, NOW)
    ).toBe(false)
  })

  it("TC-4.4-01 aynı alan + sorun + açık iş emri + pencere içinde → birleştirilir", () => {
    const open = {
      id: "wo-1",
      status: "assigned" as WorkOrderStatus,
      locationId: "loc-1",
      areaId: "area-1",
      categoryCode: "paper_towel",
      lastReportAt: at(20),
    }
    const incoming = {
      locationId: "loc-1",
      areaId: "area-1",
      categoryCode: "paper_towel",
      receivedAt: at(0),
    }
    expect(findMergeTarget([open], incoming, 30)?.id).toBe("wo-1")
    // Pencere dışı, farklı alan, farklı sorun, kapalı iş emri, pencere kapalı
    expect(
      findMergeTarget([{ ...open, lastReportAt: at(31) }], incoming, 30)
    ).toBeNull()
    expect(
      findMergeTarget([{ ...open, areaId: "area-2" }], incoming, 30)
    ).toBeNull()
    expect(
      findMergeTarget([{ ...open, categoryCode: "soap" }], incoming, 30)
    ).toBeNull()
    expect(
      findMergeTarget([{ ...open, status: "completed" }], incoming, 30)
    ).toBeNull()
    expect(findMergeTarget([open], incoming, 0)).toBeNull()
    // Birden fazla adaydan son bildirimi en yeni olan seçilir
    expect(
      findMergeTarget(
        [open, { ...open, id: "wo-2", lastReportAt: at(5) }],
        incoming,
        30
      )?.id
    ).toBe("wo-2")
  })

  it("SLA uyumu yalnızca kapananları sayar", () => {
    expect(
      slaCompliance([
        { status: "verified", dueAt: at(0), completedAt: at(10) },
        { status: "completed", dueAt: at(20), completedAt: at(10) },
        { status: "in_progress", dueAt: at(20), completedAt: null },
        { status: "cancelled", dueAt: at(20), completedAt: null },
      ])
    ).toEqual({ closed: 2, onTime: 1, rate: 0.5 })
    expect(slaCompliance([])).toEqual({ closed: 0, onTime: 0, rate: null })
  })
})
