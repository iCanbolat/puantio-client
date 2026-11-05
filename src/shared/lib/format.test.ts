import { describe, expect, it } from "vitest"

import { kurus } from "./money"
import {
  compareTr,
  foldTr,
  formatCountdown,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  formatTime,
  includesTr,
  sortByTr,
  toLowerTr,
  toUpperTr,
} from "./format"

describe("format (tr-TR)", () => {
  it("TC-0.3-05 para kuruştan TL'ye biçimlenir", () => {
    expect(formatMoney(kurus(123_456))).toBe("₺1.234,56")
    expect(formatMoney(kurus(123_456), { symbol: false })).toBe("1.234,56")
    expect(formatMoney(kurus(0))).toBe("₺0,00")
    expect(formatMoney(kurus(-5050))).toBe("-₺50,50")
  })

  it("TC-0.3-06 Türkçe alfabetik sıralama", () => {
    expect(
      ["Şule", "Ilgaz", "İpek", "Çağrı", "Zeynep", "Ömer"].sort(compareTr)
    ).toEqual(["Çağrı", "Ilgaz", "İpek", "Ömer", "Şule", "Zeynep"])
    expect(
      sortByTr([{ ad: "Ümit" }, { ad: "Uğur" }], (item) => item.ad).map(
        (item) => item.ad
      )
    ).toEqual(["Uğur", "Ümit"])
  })

  it("sayı ve yüzde", () => {
    expect(formatNumber(15_000)).toBe("15.000")
    expect(formatPercent(0.0667)).toBe("%6,7")
    expect(formatPercent(1)).toBe("%100")
  })

  it("TC-0.3-10 tarihler tarayıcı saat diliminden bağımsız İstanbul'a göre biçimlenir", () => {
    // UTC 21:30 → İstanbul ertesi gün 00:30
    const instant = "2026-09-25T21:30:00Z"
    expect(formatDate(instant)).toBe("26.09.2026")
    expect(formatTime(instant)).toBe("00:30")
    expect(formatDateTime(instant)).toBe("26.09.2026 00:30")
    expect(formatDateLong("2026-09-25T09:00:00+03:00")).toBe(
      "25 Eylül 2026 Cuma"
    )
  })

  it("göreli zaman", () => {
    expect(formatRelative("2026-09-25T09:00:00Z", "2026-09-25T09:03:00Z")).toBe(
      "3 dakika önce"
    )
    expect(formatRelative("2026-09-25T11:00:00Z", "2026-09-25T09:00:00Z")).toBe(
      "yaklaşık 2 saat sonra"
    )
  })

  it("geri sayım ve süre", () => {
    expect(formatCountdown(15 * 60_000)).toBe("15:00")
    expect(formatCountdown(905_000)).toBe("15:05")
    expect(formatCountdown(3_725_000)).toBe("1:02:05")
    expect(formatCountdown(-135_000)).toBe("-02:15")
    expect(formatDuration(3_900_000)).toBe("1 sa 5 dk")
    expect(formatDuration(90_000)).toBe("1 dk 30 sn")
    expect(formatDuration(0)).toBe("0 sn")
  })

  it("Türkçe büyük/küçük harf dönüşümü ve arama", () => {
    expect(toUpperTr("istanbul")).toBe("İSTANBUL")
    expect(toLowerTr("IĞDIR")).toBe("ığdır")
    expect(includesTr("İSTANBUL Havalimanı", "istanbul")).toBe(true)
    expect(includesTr("Diyarbakır", "DIYAR")).toBe(true)
    expect(includesTr("Şişli Plaza", "sisli")).toBe(true)
    expect(includesTr("Çağlayan Adliyesi", "CAGLAYAN")).toBe(true)
    expect(foldTr("İĞNEADA Şube")).toBe("igneada sube")
    expect(includesTr("Ankara", "izmir")).toBe(false)
  })
})
