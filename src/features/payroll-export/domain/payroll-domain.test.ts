import { describe, expect, it } from "vitest"

import type { CellCode } from "@/features/timesheet"
import { decodeWindows1254 } from "@/shared/lib/encoding"

import {
  buildPayrollTable,
  formatPayrollValue,
  payrollFileName,
  renderDelimited,
  renderFixedWidth,
  renderTextFile,
  type PayrollSourceRow,
} from "./build-table"
import { GENERIC_CSV, LOGO_BORDRO_PLUS } from "./library"

const context = {
  year: 2026,
  month: 9,
  legalEntityTitle: "Lavanta Temizlik A.Ş.",
}

function row(
  codes: (CellCode | null)[],
  patch: Partial<PayrollSourceRow> = {}
): PayrollSourceRow {
  return {
    personnelId: "p1",
    employeeNumber: "S00001",
    tckn: "10000000146",
    firstName: "Şükrü",
    lastName: "Ağaoğlu",
    locationCode: "LOK-00001",
    cells: codes.map((code, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      code,
      overtimeHours: 0,
      nightHours: 0,
      holidayWorkHours: 0,
      weeklyRestWorkHours: 0,
      missingHours: 0,
    })),
    ...patch,
  }
}

/** Eylül 2026 (30 gün): 4 pazar HT, 1 yıllık izin, 25 gün çalışma */
const SEPTEMBER: CellCode[] = Array.from({ length: 30 }, (_, index) => {
  const day = index + 1
  if ([6, 13, 20, 27].includes(day)) return "HT"
  if (day === 10) return "Yİ"
  return "N"
})

describe("Batch 2.6 bordro aktarımı", () => {
  it("TC-2.6-02 Logo profili: başlık ve kolon sırası şablonla birebir, gün toplamı 30", () => {
    const table = buildPayrollTable(LOGO_BORDRO_PLUS, context, [row(SEPTEMBER)])
    expect(table.headers).toEqual([
      "Sicil No",
      "T.C. Kimlik No",
      "Adı",
      "Soyadı",
      "Dönem Yılı",
      "Dönem Ayı",
      "Bölüm / Lokasyon Kodu",
      "Çalışılan Gün",
      "Hafta Tatili",
      "Genel Tatil",
      "Yıllık İzin",
      "Ücretsiz İzin",
      "İstirahat (Rapor)",
      "Devamsızlık",
      "Mazeret İzni",
      "Fazla Mesai %50",
      "Hafta Tatili Mesaisi",
      "Genel Tatil Mesaisi",
      "Gece Çalışması",
      "Eksik Saat",
    ])
    const values = table.rows[0]?.values ?? []
    expect(values.slice(0, 15)).toEqual([
      "S00001",
      "10000000146",
      "Şükrü",
      "Ağaoğlu",
      2026,
      9,
      "LOK-00001",
      25,
      4,
      0,
      1,
      0,
      0,
      0,
      0,
    ])
    const dayTotal = values
      .slice(7, 15)
      .reduce<number>((sum, value) => sum + Number(value), 0)
    expect(dayTotal).toBe(30)
    expect(table.rows[0]?.errors).toEqual([])
  })

  it("TC-2.6-01 Logo profili Windows-1254 CSV: 'ŞĞİşğı' baytları kod sayfasıyla eşleşir", () => {
    const profile = { ...LOGO_BORDRO_PLUS, format: "csv" as const }
    const table = buildPayrollTable(profile, context, [
      row(SEPTEMBER, { firstName: "ŞĞİşğı" }),
    ])
    const bytes = renderTextFile(table, profile)
    const text = decodeWindows1254(bytes)
    expect(text.split("\r\n")[1]).toContain(";ŞĞİşğı;")
    const start = text.indexOf("ŞĞİşğı")
    expect([...bytes.slice(start, start + 6)]).toEqual([
      0xde, 0xd0, 0xdd, 0xfe, 0xf0, 0xfd,
    ])
    // BOM yok, ayraç ; ve satır sonu CRLF
    expect(bytes[0]).toBe("S".charCodeAt(0))
    expect(text.split("\r\n")[0]?.split(";")).toHaveLength(20)
  })

  it("TC-2.6-03 gün toplamı tutmayan personel satırı hatalıdır", () => {
    const broken = [...SEPTEMBER]
    broken[3] = "?"
    broken[4] = null
    const table = buildPayrollTable(LOGO_BORDRO_PLUS, context, [
      row(SEPTEMBER),
      row(broken, { personnelId: "p2" }),
    ])
    expect(table.rows[0]?.errors).toEqual([])
    expect(table.rows[1]?.errors).toEqual([
      "2 günün kodu belirsiz (ilk: 04.09.2026); puantajı düzeltin.",
      "Gün toplamı 28; dönemde 30 gün olmalı. Kod eşlemesini veya puantajı kontrol edin.",
    ])
    // Kod eşlemesinde unutulan kod (D) de gün toplamını bozar
    const withAbsence = [...SEPTEMBER]
    withAbsence[1] = "D"
    const noAbsence = {
      ...LOGO_BORDRO_PLUS,
      columns: LOGO_BORDRO_PLUS.columns.filter(
        (column) => column.header !== "Devamsızlık"
      ),
    }
    expect(
      buildPayrollTable(noAbsence, context, [row(withAbsence)]).rows[0]
        ?.errors[0]
    ).toMatch(/Gün toplamı 29/)
  })

  it("TC-2.6-04 arefe yarım günü + fazla mesai: Çalışılan Gün 0,5 artar, FM ondalık 7,5", () => {
    const codes = [...SEPTEMBER]
    codes[1] = "YG"
    const source = row(codes)
    source.cells[1]!.overtimeHours = 2.5
    source.cells[2]!.overtimeHours = 5
    const profile = { ...LOGO_BORDRO_PLUS, format: "csv" as const }
    const table = buildPayrollTable(profile, context, [source])
    const values = table.rows[0]?.values ?? []
    expect(values[7]).toBe(24.5) // Çalışılan Gün
    expect(values[9]).toBe(0.5) // Genel Tatil
    expect(values[15]).toBe(7.5) // Fazla Mesai %50
    expect(table.rows[0]?.errors).toEqual([])
    const line =
      decodeWindows1254(renderTextFile(table, profile)).split("\r\n")[1] ?? ""
    expect(line.split(";")[7]).toBe("24,5")
    expect(line.split(";")[15]).toBe("7,5")
  })

  it("TC-2.6-05 kod eşlemesi düzenlenmiş Genel CSV çıktısı", () => {
    const profile = {
      ...GENERIC_CSV,
      decimalSeparator: "." as const,
      codeMap: { N: "C", HT: "H", Yİ: "YI" },
      columns: GENERIC_CSV.columns.filter(
        (column) =>
          column.source.kind !== "field" || column.header !== "T.C. Kimlik No"
      ),
    }
    const source = row(["N", "HT", "Yİ", "D"])
    source.cells[0]!.overtimeHours = 1.5
    const table = buildPayrollTable(profile, context, [source])
    expect(renderDelimited(table, profile)).toBe(
      "Sicil No;Ad;Soyad;Yıl;Ay;Gün 1;Gün 2;Gün 3;Gün 4;Fazla Mesai (saat);Gece (saat)\r\n" +
        "S00001;Şükrü;Ağaoğlu;2026;9;C;H;YI;D;1.5;0\r\n"
    )
    const bytes = renderTextFile(table, profile)
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  })

  it("TXT sabit genişlik, değer biçimleri ve dosya adı", () => {
    const profile = {
      ...LOGO_BORDRO_PLUS,
      format: "txt" as const,
      includeHeader: false,
    }
    const text = renderFixedWidth(
      buildPayrollTable(profile, context, [row(SEPTEMBER)]),
      profile
    )
    expect(text.startsWith("S00001    10000000146")).toBe(true)
    expect(formatPayrollValue(7.5, ",")).toBe("7,5")
    expect(formatPayrollValue(7.5, ".")).toBe("7.5")
    expect(formatPayrollValue("a;b", ",")).toBe("a;b")
    expect(payrollFileName(profile, context, "lavanta")).toBe(
      "puantaj-lavanta-2026-09.txt"
    )
    const quoted = renderDelimited(
      {
        headers: ["Ad"],
        rows: [{ personnelId: "x", name: "x", values: ['A;"B"'], errors: [] }],
      },
      { delimiter: ";", decimalSeparator: ",", includeHeader: false }
    )
    expect(quoted).toBe('"A;""B"""\r\n')
  })
})
