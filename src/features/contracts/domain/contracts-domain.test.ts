import { describe, expect, it } from "vitest"

import { kurus } from "@/shared/lib/money"

import {
  commitmentSchema,
  contractGeneralSchema,
  type ContractRules,
  type ContractVersion,
} from "../model/contract"
import { validateCommitments } from "./commitments"
import {
  actualHeadcount,
  formatHeadcountGap,
  headcountGap,
  plannedDates,
  plannedDaysInMonth,
} from "./headcount"
import { diffVersions } from "./version-diff"
import { checkAddendum, versionAt, versionSegments } from "./versions"

const rules: ContractRules = {
  shortfallDeductionPercent: 100,
  shortfallPenaltyPerPersonDay: kurus(0),
  vatRate: 20,
  priceAdjustment: {
    kind: "none",
    laborSharePercent: 100,
    ratePercent: null,
    effectiveFrom: null,
  },
  penalties: [],
}

function version(
  number: number,
  effectiveFrom: string,
  effectiveTo: string,
  overrides: Partial<ContractVersion> = {}
): ContractVersion {
  return {
    id: `v${number}`,
    number,
    effectiveFrom,
    effectiveTo,
    note: null,
    createdAt: "2026-01-01T09:00:00+03:00",
    createdBy: "Test",
    serviceLines: ["cleaning"],
    scopeItems: [],
    locations: [
      {
        locationId: "l1",
        locationName: "Merkez",
        orgUnitName: "Marmara",
        from: "2026-01-01",
        to: null,
      },
    ],
    commitments: [
      {
        locationId: "l1",
        position: "cleaning_staff",
        headcount: 10,
        coverage: "six_days",
      },
    ],
    prices: {
      unitPrices: [{ position: "cleaning_staff", monthly: kurus(3_000_000) }],
      overtimeHourly: kurus(25_000),
      materialMonthly: kurus(0),
    },
    rules,
    ...overrides,
  }
}

describe("Faz 3 sözleşme domain'i", () => {
  it("TC-3.1-01 taahhüt kadro negatif veya boşsa şema hatası verir", () => {
    const base = {
      locationId: "l1",
      position: "cleaning_staff",
      coverage: "six_days",
    }
    const negative = commitmentSchema.safeParse({ ...base, headcount: -2 })
    expect(negative.success).toBe(false)
    expect(negative.error?.issues[0]?.message).toBe(
      "Taahhüt kadro en az 1 kişi olmalı"
    )
    const empty = commitmentSchema.safeParse({ ...base, headcount: undefined })
    expect(empty.error?.issues[0]?.message).toBe("Taahhüt kadroyu girin")
    expect(
      commitmentSchema.safeParse({ ...base, headcount: 1.5 }).error?.issues[0]
        ?.message
    ).toBe("Tam sayı olmalı")
  })

  it("TC-3.1-01b mükerrer lokasyon × pozisyon ve kapsam dışı lokasyon yakalanır", () => {
    const result = validateCommitments(
      [
        {
          locationId: "l1",
          position: "cleaning_staff",
          headcount: 3,
          coverage: "six_days",
        },
        {
          locationId: "l1",
          position: "cleaning_staff",
          headcount: 2,
          coverage: "six_days",
        },
        {
          locationId: "lx",
          position: "supervisor",
          headcount: 1,
          coverage: "six_days",
        },
      ],
      [
        { locationId: "l1", locationName: "Merkez" },
        { locationId: "l2", locationName: "Depo" },
      ]
    )
    expect(result.issues.map((issue) => issue.index)).toEqual([1, 2])
    expect(result.uncoveredLocations).toEqual(["Depo"])
  })

  it("TC-3.1-02 son sürümle aynı güne veya öncesine düşen zeyilname çakışma verir", () => {
    const contract = { startDate: "2026-01-01", endDate: "2026-12-31" }
    const versions = [
      version(0, "2026-01-01", "2026-05-31"),
      version(1, "2026-06-01", "2026-12-31"),
    ]
    const same = checkAddendum(contract, versions, "2026-06-01")
    expect(same).toMatchObject({ ok: false, code: "VERSION_OVERLAP" })
    const inside = checkAddendum(contract, versions, "2026-03-10")
    expect(inside.ok).toBe(false)
    if (!inside.ok) expect(inside.message).toContain("Asıl sözleşme")
    expect(checkAddendum(contract, versions, "2027-01-02")).toMatchObject({
      ok: false,
      code: "OUT_OF_CONTRACT",
    })
    expect(checkAddendum(contract, versions, "2026-09-15")).toEqual({
      ok: true,
      closes: "v1",
      closesAt: "2026-09-14",
    })
  })

  it("TC-3.1-03 kamu ihalesinde İKN zorunlu ve biçimli", () => {
    const base = {
      title: "Hastane temizlik",
      customerId: "c1",
      contractorLegalEntityId: "le1",
      ikn: "",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      templateId: null,
    }
    const missing = contractGeneralSchema.safeParse({
      ...base,
      type: "public_tender",
    })
    expect(missing.error?.issues[0]?.message).toBe(
      "Kamu ihalesinde İKN zorunludur"
    )
    expect(
      contractGeneralSchema.safeParse({
        ...base,
        type: "public_tender",
        ikn: "26-1",
      }).error?.issues[0]?.message
    ).toBe("İKN biçimi: 2026/123456")
    expect(
      contractGeneralSchema.safeParse({
        ...base,
        type: "public_tender",
        ikn: "2026/481516",
      }).success
    ).toBe(true)
    expect(
      contractGeneralSchema.safeParse({ ...base, type: "private" }).success
    ).toBe(true)
  })

  it("TC-3.1-04 sürüm karşılaştırma kadro, fiyat ve lokasyon farklarını listeler", () => {
    const before = version(0, "2026-01-01", "2026-05-31")
    const after = version(1, "2026-06-01", "2026-12-31", {
      commitments: [
        {
          locationId: "l1",
          position: "cleaning_staff",
          headcount: 12,
          coverage: "six_days",
        },
        {
          locationId: "l2",
          position: "supervisor",
          headcount: 1,
          coverage: "weekdays",
        },
      ],
      locations: [
        { ...before.locations[0]!, to: "2026-08-31" },
        {
          locationId: "l2",
          locationName: "Depo",
          orgUnitName: "Marmara",
          from: "2026-06-01",
          to: null,
        },
      ],
      prices: {
        ...before.prices,
        unitPrices: [
          { position: "cleaning_staff", monthly: kurus(3_300_000) },
          { position: "supervisor", monthly: kurus(4_500_000) },
        ],
      },
    })
    const diff = diffVersions(before, after)
    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "Lokasyon",
          kind: "added",
          label: "Depo",
        }),
        expect.objectContaining({
          section: "Lokasyon",
          kind: "changed",
          label: "Merkez",
        }),
        expect.objectContaining({
          section: "Kadro",
          kind: "changed",
          before: "10 kişi",
          after: "12 kişi",
        }),
        expect.objectContaining({ section: "Kadro", kind: "added" }),
        expect.objectContaining({ section: "Fiyat", kind: "changed" }),
      ])
    )
    const price = diff.find(
      (item) => item.section === "Fiyat" && item.label.startsWith("Temizlik")
    )
    expect(price?.after).toContain("+%10")
  })

  it("versionAt ve versionSegments ayı sürümlere böler", () => {
    const versions = [
      version(0, "2026-01-01", "2026-09-14"),
      version(1, "2026-09-15", "2026-12-31"),
    ]
    expect(versionAt(versions, "2026-09-14")?.number).toBe(0)
    expect(versionAt(versions, "2027-01-01")).toBeNull()
    expect(
      versionSegments(versions, "2026-09").map((segment) => [
        segment.version.number,
        segment.from,
        segment.to,
      ])
    ).toEqual([
      [0, "2026-09-01", "2026-09-14"],
      [1, "2026-09-15", "2026-09-30"],
    ])
  })

  it("planlı iş günleri vardiya kapsamına ve resmi tatile göre hesaplanır", () => {
    const holidays = new Set(["2026-10-29"])
    // Ekim 2026: 31 gün, 4 Pazar, 29 Ekim Perşembe tatil
    expect(plannedDaysInMonth("all_days", "2026-10", holidays)).toBe(31)
    expect(plannedDaysInMonth("six_days", "2026-10", holidays)).toBe(26)
    expect(plannedDaysInMonth("weekdays", "2026-10", holidays)).toBe(21)
    expect(
      plannedDates(
        "six_days",
        { from: "2026-09-01", to: "2026-09-06" },
        new Set()
      )
    ).toHaveLength(5)
  })

  it("TC-3.2-01 kadro formülü: 120 taahhüt, 112 fiili → −8 (%6,7)", () => {
    const planned = 26
    const actual = actualHeadcount(112 * planned, planned)
    expect(actual).toBe(112)
    expect(formatHeadcountGap(headcountGap(120, actual))).toBe(
      "120 / 112, −8 (%6,7)"
    )
    expect(actualHeadcount(100, 0)).toBe(0)
    expect(formatHeadcountGap(headcountGap(10, 10))).toBe("10 / 10, ±0 (%0)")
  })
})
