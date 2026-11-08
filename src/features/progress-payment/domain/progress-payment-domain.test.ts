import { describe, expect, it } from "vitest"

import type { ContractRules } from "@/features/contracts"
import type { Permission } from "@/entities/session"
import { kurus } from "@/shared/lib/money"
import { eachIsoDate, isoWeekday } from "@/shared/lib/work-time"

import {
  calculateProgressPayment,
  diffCalculations,
  sourceFingerprint,
  type CalculationInput,
  type CalculationVersion,
  type WorkedEntry,
} from "./calculate"
import { availablePaymentActions, nextPaymentStatus } from "./status"

const RULES: ContractRules = {
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
  overrides: Partial<CalculationVersion> = {}
): CalculationVersion {
  return {
    number: 0,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    locations: [
      {
        locationId: "l1",
        locationName: "Merkez",
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
      materialMonthly: kurus(500_000),
    },
    rules: RULES,
    ...overrides,
  }
}

/** Eylül 2026'nın her günü `count(date)` kişi çalışır */
function worked(
  count: (date: string) => number,
  overtime: (date: string) => number = () => 0
): WorkedEntry[] {
  return eachIsoDate("2026-09-01", "2026-09-30").map((date) => ({
    locationId: "l1",
    position: "cleaning_staff",
    date,
    personDays: count(date),
    overtimeHours: overtime(date),
  }))
}

function input(overrides: Partial<CalculationInput> = {}): CalculationInput {
  return {
    month: "2026-09",
    contractStartDate: "2026-01-01",
    versions: [version()],
    worked: worked(() => 10),
    fullHolidays: new Set(),
    minWages: [],
    penalties: [],
    ...overrides,
  }
}

const SHORT_DAYS = new Set(["2026-09-08", "2026-09-09", "2026-09-10"])

describe("Faz 3 hakediş hesabı", () => {
  it("TC-3.3-01 kuruş hassasiyetinde işçilik, kesinti, FM, malzeme, ceza ve KDV", () => {
    const result = calculateProgressPayment(
      input({
        worked: worked(
          (date) => (SHORT_DAYS.has(date) ? 8 : 10),
          (date) => (date === "2026-09-02" ? 12 : 0)
        ),
      })
    )
    // Eylül 2026, 6 gün kapsam: 30 − 4 Pazar = 26 planlı gün
    expect(result.stats).toMatchObject({
      committedPersonDays: 260,
      workedPersonDays: 254,
      shortfallPersonDays: 6,
      overtimeHours: 12,
    })
    expect(result.totals).toEqual({
      labor: 30_000_000,
      deductions: -692_308, // 30.000 × 6 ÷ 26 = 6.923,0769 → 6.923,08
      overtime: 300_000,
      material: 500_000,
      priceAdjustment: 0,
      penalties: 0,
      subtotal: 30_107_692,
      vatRate: 20,
      vat: 6_021_538, // 60.215,384 → 60.215,38
      total: 36_129_230,
    })
    const shortfall = result.lines.find((line) => line.kind === "shortfall")
    expect(shortfall).toMatchObject({ quantity: 6, unitPrice: 115_385 })

    const withPenalty = calculateProgressPayment(
      input({
        penalties: [
          {
            code: "C1",
            label: "Kıyafet eksikliği",
            kind: "fixed",
            amount: 100_000,
            quantity: 1,
            note: null,
          },
          {
            code: "C2",
            label: "Denetim puanı düşük",
            kind: "percent",
            amount: 1,
            quantity: 1,
            note: "Eylül denetimi",
          },
        ],
      })
    )
    expect(withPenalty.totals.penalties).toBe(-100_000 - 300_000)
    expect(withPenalty.lines.at(-1)?.label).toBe(
      "Denetim puanı düşük (Eylül denetimi)"
    )
  })

  it("TC-3.3-01b taahhüt üstü çalışma ödenmez, kesinti oranı ve kişi-gün cezası uygulanır", () => {
    const result = calculateProgressPayment(
      input({
        worked: worked((date) => (SHORT_DAYS.has(date) ? 8 : 12)),
        versions: [
          version({
            rules: {
              ...RULES,
              shortfallDeductionPercent: 150,
              shortfallPenaltyPerPersonDay: kurus(50_000),
            },
            prices: {
              unitPrices: [
                { position: "cleaning_staff", monthly: kurus(3_000_000) },
              ],
              overtimeHourly: kurus(0),
              materialMonthly: kurus(0),
            },
          }),
        ],
      })
    )
    expect(result.stats.excessPersonDays).toBe(23 * 2)
    expect(result.totals.labor).toBe(30_000_000)
    // 30.000 × 6 ÷ 26 × 1,5 = 10.384,615 → 10.384,62; ceza 6 × 500
    expect(result.totals.deductions).toBe(-1_038_462 - 300_000)
  })

  it("TC-3.3-02 ayın 15'inde fiyat değişikliği: iki dilim kıst hesaplanır", () => {
    const result = calculateProgressPayment(
      input({
        versions: [
          version({ effectiveTo: "2026-09-14" }),
          version({
            number: 1,
            effectiveFrom: "2026-09-15",
            prices: {
              unitPrices: [
                { position: "cleaning_staff", monthly: kurus(3_300_000) },
              ],
              overtimeHourly: kurus(25_000),
              materialMonthly: kurus(500_000),
            },
          }),
        ],
      })
    )
    const labor = result.lines.filter((line) => line.kind === "labor")
    // 1–14 Eylül: 12 planlı gün; 15–30 Eylül: 14 planlı gün
    expect(labor.map((line) => [line.versionNumber, line.amount])).toEqual([
      [0, 13_846_154], // 300.000 × 12 ÷ 26
      [1, 17_769_231], // 330.000 × 14 ÷ 26
    ])
    expect(result.totals.labor).toBe(31_615_385)
    expect(result.totals.deductions).toBe(0)
    // Malzeme takvim günüyle bölünür: 14/30 + 16/30
    expect(result.totals.material).toBe(233_333 + 266_667)
  })

  it("TC-3.3-03 dönem ortasında kapsamdan çıkan lokasyonda yalnızca kapsam günleri hesaplanır", () => {
    const result = calculateProgressPayment(
      input({
        versions: [
          version({
            locations: [
              {
                locationId: "l1",
                locationName: "Merkez",
                from: "2026-01-01",
                to: "2026-09-15",
              },
            ],
          }),
        ],
        worked: worked(
          () => 10,
          () => 1
        ),
      })
    )
    // 1–15 Eylül: 13 planlı gün → 300.000 × 13 ÷ 26 = 150.000
    expect(result.totals.labor).toBe(15_000_000)
    expect(result.stats.committedPersonDays).toBe(130)
    expect(result.stats.workedPersonDays).toBe(130)
    expect(result.stats.overtimeHours).toBe(15)
  })

  it("TC-3.3-06 KİK md. 83: 15 Eylül asgari ücret artışı işçilik farkına kıst yansır", () => {
    const result = calculateProgressPayment(
      input({
        versions: [
          version({
            rules: {
              ...RULES,
              priceAdjustment: {
                kind: "min_wage",
                laborSharePercent: 100,
                ratePercent: null,
                effectiveFrom: null,
              },
            },
          }),
        ],
        minWages: [
          { effectiveFrom: "2026-01-01", grossMonthly: kurus(2_600_000) },
          { effectiveFrom: "2026-09-15", grossMonthly: kurus(2_860_000) },
        ],
      })
    )
    // %10 artış 14/26 planlı güne: 300.000 × 0,1 × 14 ÷ 26 = 16.153,846 → 16.153,85
    expect(result.totals.priceAdjustment).toBe(1_615_385)
    const line = result.lines.find((item) => item.kind === "price_adjustment")
    expect(line?.quantity).toBe(5.38)

    const fixed = calculateProgressPayment(
      input({
        versions: [
          version({
            rules: {
              ...RULES,
              priceAdjustment: {
                kind: "fixed_rate",
                laborSharePercent: 50,
                ratePercent: 20,
                effectiveFrom: "2026-09-01",
              },
            },
          }),
        ],
      })
    )
    expect(fixed.totals.priceAdjustment).toBe(3_000_000)
  })

  it("parmak izi veri sırasından bağımsızdır, değişince farklıdır; fark tablosu", () => {
    const entries = worked(() => 10)
    expect(sourceFingerprint(entries)).toBe(
      sourceFingerprint([...entries].reverse())
    )
    const changed = worked((date) => (date === "2026-09-03" ? 9 : 10))
    expect(sourceFingerprint(changed)).not.toBe(sourceFingerprint(entries))
    const before = calculateProgressPayment(input())
    const after = calculateProgressPayment(input({ worked: changed }))
    const changes = diffCalculations(before, after)
    expect(changes.map((change) => change.key)).toEqual([
      "shortfall|l1|cleaning_staff|0",
      "total",
    ])
    expect(changes[0]).toMatchObject({ before: null, after: -115_385 })
  })

  it("Pazar günleri 6 gün kapsamda planlı değildir", () => {
    const sundays = eachIsoDate("2026-09-01", "2026-09-30").filter(
      (date) => isoWeekday(date) === 7
    )
    const result = calculateProgressPayment(
      input({
        worked: worked((date) => (sundays.includes(date) ? 0 : 10)),
      })
    )
    expect(result.stats.shortfallPersonDays).toBe(0)
  })

  it("TC-3.3-04 onay yetkisi olmayan kullanıcıya geçiş sunulmaz", () => {
    const finance = new Set<Permission>([
      "progress_payment:read",
      "progress_payment:approve",
    ])
    const regional = new Set<Permission>(["progress_payment:read"])
    const customer = new Set<Permission>(["progress_payment:approve_customer"])
    expect(availablePaymentActions("draft", finance, true)).toEqual(["submit"])
    expect(availablePaymentActions("draft", finance, false)).toEqual([])
    expect(availablePaymentActions("review", regional, true)).toEqual([])
    expect(
      availablePaymentActions("customer_approval", customer, true)
    ).toEqual(["approve_customer"])
    expect(availablePaymentActions("review", finance, true)).toEqual([
      "send_to_customer",
      "return_to_draft",
    ])
    expect(nextPaymentStatus("approved", "return_to_draft")).toBeNull()
    expect(nextPaymentStatus("approved", "invoice")).toBe("invoiced")
  })
})
