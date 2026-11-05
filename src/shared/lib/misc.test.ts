import { afterEach, describe, expect, it, vi } from "vitest"

import { assertNever } from "./assert-never"
import {
  csvBlob,
  downloadBlob,
  parseContentDispositionFilename,
  toCsv,
} from "./download"
import { formatBytes, matchesAccept, validateFiles } from "./file-validation"
import { searchParamsToObject } from "./search-params"
import {
  getServerTimeOffset,
  resetServerTime,
  serverNow,
  subscribeServerTime,
  syncServerTime,
} from "./server-time"
import { getSlaState } from "./sla"
import { firstSliderValue } from "./slider"

describe("CSV ve indirme", () => {
  it("TC-0.6-04 CSV hücreleri ; ayırıcı ve tırnaklarla güvenli kaçışlanır", () => {
    expect(
      toCsv([
        ["Kod", "Ad", "Tutar"],
        ["WLC-1", 'Kule "A" Plaza', "1.234,56"],
        ["WLC-2", "Satır\nsonu", null],
        ["WLC-3", "a;b", 42],
      ])
    ).toBe(
      'Kod;Ad;Tutar\r\nWLC-1;"Kule ""A"" Plaza";1.234,56\r\nWLC-2;"Satır\nsonu";\r\nWLC-3;"a;b";42'
    )
    expect(toCsv([["a,b"]], { delimiter: "," })).toBe('"a,b"')
  })

  it("CSV blob'u Excel için UTF-8 BOM içerir", async () => {
    const blob = csvBlob("Şehir")
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(blob.type).toBe("text/csv;charset=utf-8")
  })

  it("Content-Disposition dosya adı (Türkçe karakterli)", () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename*=UTF-8''puantaj-%C5%9Fubat.csv; filename=\"puantaj.csv\""
      )
    ).toBe("puantaj-şubat.csv")
    expect(
      parseContentDispositionFilename('attachment; filename="rapor.xlsx"')
    ).toBe("rapor.xlsx")
    expect(parseContentDispositionFilename(null)).toBeNull()
  })

  it("downloadBlob geçici bir bağlantı oluşturup tıklar", () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => "blob:test")
    const revokeObjectURL = vi.fn()
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL })
    )
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined)

    downloadBlob(new Blob(["x"]), "dosya.csv")
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector("a[download]")).toBeNull()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test")
    vi.useRealTimers()
  })
})

describe("sunucu saati", () => {
  afterEach(() => {
    resetServerTime()
  })

  it("TC-0.3-14 offset hesaplanır ve serverNow uygulanır", () => {
    syncServerTime(
      "2026-09-29T07:10:00+03:00",
      Date.parse("2026-09-29T04:00:00Z")
    )
    expect(getServerTimeOffset()).toBe(10 * 60_000)
    const drift = serverNow().getTime() - Date.now()
    expect(Math.abs(drift - 10 * 60_000)).toBeLessThan(50)
  })

  it("yalnızca anlamlı değişimde dinleyicileri uyarır", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeServerTime(listener)
    const now = Date.now()
    syncServerTime(new Date(now + 300).toISOString(), now) // ağ gürültüsü
    expect(listener).not.toHaveBeenCalled()
    syncServerTime(new Date(now + 60_000).toISOString(), now)
    expect(listener).toHaveBeenCalledOnce()
    syncServerTime("geçersiz", now)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })
})

describe("küçük yardımcılar", () => {
  it("SLA durumu eşikleri", () => {
    expect(getSlaState(10 * 60_000, 5 * 60_000)).toBe("ok")
    expect(getSlaState(5 * 60_000, 5 * 60_000)).toBe("warning")
    expect(getSlaState(-1, 5 * 60_000)).toBe("breached")
  })

  it("dosya doğrulama", () => {
    const xlsx = new File(["x"], "personel.XLSX", { type: "" })
    const png = new File(["x"], "foto.png", { type: "image/png" })
    const big = new File([new Uint8Array(2048)], "büyük.csv", {
      type: "text/csv",
    })
    expect(matchesAccept(xlsx, ".xlsx,.csv")).toBe(true)
    expect(matchesAccept(png, "image/*")).toBe(true)
    expect(matchesAccept(png, "image/jpeg")).toBe(false)
    expect(matchesAccept(png, undefined)).toBe(true)

    const result = validateFiles([xlsx, png, big], {
      accept: ".xlsx,.csv",
      maxSizeBytes: 1024,
    })
    expect(result.accepted).toEqual([xlsx])
    expect(result.rejected.map((item) => item.reason)).toEqual([
      "Desteklenmeyen dosya türü",
      "Dosya 1 KB sınırını aşıyor",
    ])
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1_572_864)).toBe("1,5 MB")
  })

  it("URL parametreleri nesneye çevrilir", () => {
    expect(searchParamsToObject(new URLSearchParams("a=1&b=x&b=y&c="))).toEqual(
      {
        a: "1",
        b: ["x", "y"],
        c: "",
      }
    )
  })

  it("slider değeri ve assertNever", () => {
    expect(firstSliderValue(5)).toBe(5)
    expect(firstSliderValue([7, 9])).toBe(7)
    expect(firstSliderValue([], 3)).toBe(3)
    expect(() => assertNever("x" as never)).toThrow('Beklenmeyen değer: "x"')
  })
})
