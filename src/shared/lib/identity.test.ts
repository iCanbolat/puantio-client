import { describe, expect, it } from "vitest"

import {
  formatTrMobile,
  maskTrMobile,
  normalizeTrMobile,
  trMobileSchema,
} from "./phone"
import { isValidTckn, maskTckn, tcknSchema } from "./tckn"

describe("T.C. Kimlik No", () => {
  it("TC-0.3-12 geçerli numaralar", () => {
    expect(isValidTckn("10000000146")).toBe(true)
    expect(isValidTckn("12345678950")).toBe(true)
  })

  it("geçersiz numaralar", () => {
    expect(isValidTckn("10000000147")).toBe(false) // 11. hane hatalı
    expect(isValidTckn("10000000156")).toBe(false) // 10. hane hatalı
    expect(isValidTckn("01234567890")).toBe(false) // 0 ile başlar
    expect(isValidTckn("1234567895")).toBe(false) // 10 hane
    expect(isValidTckn("1234567895a")).toBe(false)
  })

  it("şema mesajları", () => {
    expect(tcknSchema.safeParse("123").error?.issues[0]?.message).toBe(
      "T.C. Kimlik No 11 haneli olmalı"
    )
    expect(tcknSchema.safeParse("10000000147").error?.issues[0]?.message).toBe(
      "Geçersiz T.C. Kimlik No"
    )
    expect(tcknSchema.parse(" 10000000146 ")).toBe("10000000146")
  })

  it("KVKK maskeleme", () => {
    expect(maskTckn("10000000146")).toBe("*********46")
    expect(maskTckn("1")).toBe("*")
  })
})

describe("cep telefonu", () => {
  it("TC-0.3-13 farklı yazımları E.164'e normalleştirir", () => {
    for (const input of [
      "0532 123 45 67",
      "532-123-4567",
      "+90 532 123 45 67",
      "905321234567",
    ]) {
      expect(normalizeTrMobile(input)).toBe("+905321234567")
    }
    expect(normalizeTrMobile("0212 123 45 67")).toBeNull() // sabit hat
    expect(normalizeTrMobile("12345")).toBeNull()
  })

  it("biçimleme, maskeleme ve şema", () => {
    expect(formatTrMobile("+905321234567")).toBe("+90 532 123 45 67")
    expect(maskTrMobile("+905321234567")).toBe("+90 532 *** ** 67")
    expect(trMobileSchema.parse("0532 123 45 67")).toBe("+905321234567")
    expect(
      trMobileSchema.safeParse("0212 123 45 67").error?.issues[0]?.message
    ).toBe("Geçerli bir cep telefonu girin (5XX XXX XX XX)")
  })
})
