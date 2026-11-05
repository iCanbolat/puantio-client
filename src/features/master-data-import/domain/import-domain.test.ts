import { describe, expect, it } from "vitest"

import { fakeTckn } from "@/mocks/factories/identity"
import { resetFaker } from "@/mocks/factories/faker"

import { buildImportDefinitions } from "../model/import-definitions"
import {
  autoMapColumns,
  chunk,
  convertCell,
  errorReportRows,
  excelSerialToIso,
  missingRequiredFields,
  parseDateCell,
  validateRows,
  type RawRow,
} from "./import-domain"

const definitions = buildImportDefinitions({
  location: "Lokasyon",
  orgLevel: "Bölge",
})
const personnel = definitions.personnel

const HEADERS = [
  "SİCİL NO",
  "TC Kimlik No",
  "Adı",
  "Soyadı",
  "Telefon",
  "Görev",
  "Hizmet",
  "İşveren VKN",
  "Lokasyon Kodu",
  "İşe Giriş Tarihi",
  "Yedek",
]

function personnelRows(count: number): RawRow[] {
  resetFaker(7)
  return Array.from({ length: count }, (_, index) => ({
    "SİCİL NO": `S${String(index + 1).padStart(5, "0")}`,
    "TC Kimlik No": fakeTckn(),
    Adı: "Ayşe",
    Soyadı: "Yılmaz",
    Telefon: "0532 123 45 67",
    Görev: "Temizlik personeli",
    Hizmet: "Temizlik",
    "İşveren VKN": "1234567890",
    "Lokasyon Kodu": "lok-00001",
    "İşe Giriş Tarihi": "15.03.2024",
    Yedek: "Hayır",
  }))
}

describe("Excel içe aktarma domain kuralları", () => {
  it("başlıklar Türkçe harf ve eş anlamlı duyarsız eşleşir", () => {
    const mapping = autoMapColumns(HEADERS, personnel.fields)
    expect(mapping).toMatchObject({
      employeeNumber: "SİCİL NO",
      tckn: "TC Kimlik No",
      firstName: "Adı",
      lastName: "Soyadı",
      phone: "Telefon",
      position: "Görev",
      legalEntityTaxNumber: "İşveren VKN",
      homeLocationCode: "Lokasyon Kodu",
      hireDate: "İşe Giriş Tarihi",
      isFloater: "Yedek",
    })
    expect(missingRequiredFields(mapping, personnel.fields)).toEqual([])
    expect(
      missingRequiredFields({}, personnel.fields).map((field) => field.key)
    ).toContain("tckn")
  })

  it("tarih, mantıksal, sayı ve liste değerleri dönüştürülür", () => {
    expect(parseDateCell("5.3.2024")).toBe("2024-03-05")
    expect(parseDateCell("2024-03-05")).toBe("2024-03-05")
    expect(parseDateCell(45366)).toBe(excelSerialToIso(45366))
    expect(excelSerialToIso(45366)).toBe("2024-03-15")
    expect(parseDateCell(new Date(2024, 2, 15))).toBe("2024-03-15")
    expect(parseDateCell("")).toBeNull()
    expect(convertCell("boolean", "Evet")).toBe(true)
    expect(convertCell("boolean", "hayır")).toBe(false)
    expect(convertCell("boolean", "belki")).toBe("belki")
    expect(convertCell("decimal", "41,0612")).toBeCloseTo(41.0612)
    expect(convertCell("decimal", "41.0612")).toBeCloseTo(41.0612)
    expect(convertCell("number", "1.250")).toBe(1250)
    expect(convertCell("number", 12)).toBe(12)
    expect(convertCell("digits", 1234567890)).toBe("1234567890")
    expect(convertCell("code", "lok-1")).toBe("LOK-1")
    expect(
      convertCell(
        { enum: { "Temizlik personeli": "cleaning_staff" } },
        "TEMİZLİK PERSONELİ"
      )
    ).toBe("cleaning_staff")
  })

  it("TC-1.7-01 100 satırda 3 hatalı satır: satır/sütun bazlı 3 hata, 97 geçerli", () => {
    const rows = personnelRows(100)
    rows[9] = { ...rows[9], "TC Kimlik No": "12345678901" }
    rows[49] = { ...rows[49], "İşe Giriş Tarihi": "" }
    rows[89] = { ...rows[89], Görev: "Astronot" }
    const result = validateRows(
      personnel,
      rows,
      autoMapColumns(HEADERS, personnel.fields)
    )
    expect(result.valid).toHaveLength(97)
    expect(result.errors).toEqual([
      { row: 11, column: "TC Kimlik No", message: "Geçersiz T.C. Kimlik No" },
      { row: 51, column: "İşe Giriş Tarihi", message: "Zorunlu alan boş" },
      { row: 91, column: "Görev", message: "Geçersiz değer" },
    ])
    expect(result.valid[0]?.data).toMatchObject({
      employeeNumber: "S00001",
      phone: "+905321234567",
      position: "cleaning_staff",
      serviceLine: "cleaning",
      homeLocationCode: "LOK-00001",
      hireDate: "2024-03-15",
      isFloater: false,
    })
    expect(errorReportRows(result.errors)[0]).toEqual([
      "Satır",
      "Sütun",
      "Hata",
    ])
  })

  it("dosya içinde tekrar eden TCKN tespit edilir", () => {
    const rows = personnelRows(3)
    rows[2] = { ...rows[2], "TC Kimlik No": rows[0]?.["TC Kimlik No"] }
    const result = validateRows(
      personnel,
      rows,
      autoMapColumns(HEADERS, personnel.fields)
    )
    expect(result.inFileDuplicates).toEqual([
      { key: rows[0]?.["TC Kimlik No"], rows: [2, 4] },
    ])
  })

  it("parçalara bölme", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 50)).toEqual([])
  })
})
