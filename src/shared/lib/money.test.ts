import { describe, expect, it } from "vitest"

import {
  addKurus,
  allocateKurus,
  kurus,
  multiplyKurus,
  parseTl,
  percentOf,
  roundHalfUp,
  subtractKurus,
  toKurus,
} from "./money"

describe("money (kuruş aritmetiği)", () => {
  it("TC-0.3-07 toKurus kayan nokta hatası olmadan yarım yukarı yuvarlar", () => {
    expect(toKurus(1.005)).toBe(101)
    expect(toKurus(2.675)).toBe(268)
    expect(toKurus(0.1 + 0.2)).toBe(30)
    expect(toKurus(-1.005)).toBe(-101)
    expect(toKurus(28_500)).toBe(2_850_000)
  })

  it("TC-0.3-08 parseTl Türkçe biçimli tutarları ayrıştırır", () => {
    expect(parseTl("1.234,56")).toBe(123_456)
    expect(parseTl("12,5 ₺")).toBe(1250)
    expect(parseTl("₺ 1.000")).toBe(100_000)
    expect(parseTl("99,999")).toBe(10_000)
    expect(parseTl("abc")).toBeNull()
    expect(parseTl("")).toBeNull()
  })

  it("çarpma ve yüzde tek yuvarlama kuralını kullanır", () => {
    expect(multiplyKurus(kurus(333), 1 / 3)).toBe(111)
    expect(multiplyKurus(kurus(5), 0.5)).toBe(3)
    expect(percentOf(kurus(10_000), 20)).toBe(2000)
    expect(percentOf(kurus(12_345), 20)).toBe(2469)
    expect(roundHalfUp(-2.5)).toBe(-3)
    expect(roundHalfUp(-0.4)).toBe(0)
  })

  it("toplama/çıkarma tam sayı kalır", () => {
    expect(addKurus(kurus(100), kurus(250), kurus(-50))).toBe(300)
    expect(subtractKurus(kurus(100), kurus(250))).toBe(-150)
    expect(() => kurus(1.5)).toThrow(RangeError)
  })

  it("TC-0.3-09 allocateKurus kuruş kaybetmeden paylaştırır (kıst hesap)", () => {
    const parts = allocateKurus(kurus(10_000), [1, 1, 1])
    expect(parts).toEqual([3334, 3333, 3333])
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(10_000)

    // 30 günlük ayda 12 + 18 gün
    const split = allocateKurus(kurus(3_000_001), [12, 18])
    expect(split.reduce((sum, part) => sum + part, 0)).toBe(3_000_001)
    expect(split).toEqual([1_200_000, 1_800_001])

    expect(allocateKurus(kurus(-100), [1, 1, 1])).toEqual([-34, -33, -33])
    expect(allocateKurus(kurus(100), [])).toEqual([])
    expect(() => allocateKurus(kurus(100), [0, 0])).toThrow(RangeError)
    expect(() => allocateKurus(kurus(100), [-1, 2])).toThrow(RangeError)
  })
})
