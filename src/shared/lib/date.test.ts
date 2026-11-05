import { describe, expect, it } from "vitest"

import { formatIsoRange } from "./date-range"
import {
  isSameIstanbulDay,
  isoDateSchema,
  isoDateTimeSchema,
  startOfIstanbulDay,
  toDate,
  toIsoDate,
} from "./date"

describe("date (Europe/Istanbul)", () => {
  it("takvim günü İstanbul'a göre hesaplanır", () => {
    expect(toIsoDate("2026-09-25T20:59:00Z")).toBe("2026-09-25")
    expect(toIsoDate("2026-09-25T21:00:00Z")).toBe("2026-09-26")
    expect(
      isSameIstanbulDay(
        "2026-09-25T00:10:00+03:00",
        "2026-09-25T23:50:00+03:00"
      )
    ).toBe(true)
    expect(
      isSameIstanbulDay(
        "2026-09-25T23:50:00+03:00",
        "2026-09-26T00:10:00+03:00"
      )
    ).toBe(false)
  })

  it("İstanbul gün başlangıcı", () => {
    expect(startOfIstanbulDay("2026-09-25T15:00:00Z").toISOString()).toBe(
      "2026-09-24T21:00:00.000Z"
    )
  })

  it("geçersiz tarih hata fırlatır", () => {
    expect(() => toDate("yarın")).toThrow(RangeError)
  })

  it("API tarih şemaları", () => {
    expect(isoDateSchema.safeParse("2026-09-25").success).toBe(true)
    expect(isoDateSchema.safeParse("25.09.2026").success).toBe(false)
    expect(
      isoDateTimeSchema.safeParse("2026-09-25T07:10:00+03:00").success
    ).toBe(true)
    expect(isoDateTimeSchema.safeParse("2026-09-25T07:10:00Z").success).toBe(
      true
    )
  })

  it("tarih aralığı metni", () => {
    expect(formatIsoRange({})).toBeNull()
    expect(formatIsoRange({ from: "2026-09-01" })).toBe("01.09.2026")
    expect(formatIsoRange({ from: "2026-09-01", to: "2026-09-01" })).toBe(
      "01.09.2026"
    )
    expect(formatIsoRange({ from: "2026-09-01", to: "2026-09-25" })).toBe(
      "01.09.2026 – 25.09.2026"
    )
  })
})
