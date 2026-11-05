import type { CellCode } from "@/features/timesheet"

import type {
  LibraryKey,
  PayrollProfileSettings,
  ProfileColumn,
} from "../model/profile"

const field = (
  header: string,
  name: Extract<ProfileColumn["source"], { kind: "field" }>["field"],
  width: number | null = null
): ProfileColumn => ({ header, source: { kind: "field", field: name }, width })

const days = (header: string, codes: CellCode[]): ProfileColumn => ({
  header,
  source: { kind: "days", codes },
  width: 6,
})

const hours = (
  header: string,
  measure: Extract<ProfileColumn["source"], { kind: "hours" }>["measure"]
): ProfileColumn => ({ header, source: { kind: "hours", measure }, width: 6 })

/**
 * Logo Bordro Plus – Puantaj aktarımı (taklit). Logo'nun Excel'den puantaj aktarımında yaygın
 * kullanılan yapıyı örnekler; gerçek şablonla doğrulanana kadar "taklit" etiketi taşır.
 * Kolon adları ve sırası plan §Batch 2.6 ile birebir.
 */
export const LOGO_BORDRO_PLUS: PayrollProfileSettings = {
  name: "Logo Bordro Plus – Puantaj aktarımı (taklit)",
  description:
    "Excel, tek sayfa, ilk satır başlık. CSV alternatifinde ; ayraç, Windows-1254, ondalık virgül.",
  format: "xlsx",
  encoding: "windows-1254",
  delimiter: ";",
  decimalSeparator: ",",
  includeHeader: true,
  columns: [
    field("Sicil No", "employeeNumber", 10),
    field("T.C. Kimlik No", "tckn", 11),
    field("Adı", "firstName", 20),
    field("Soyadı", "lastName", 20),
    field("Dönem Yılı", "periodYear", 4),
    field("Dönem Ayı", "periodMonth", 2),
    field("Bölüm / Lokasyon Kodu", "locationCode", 12),
    days("Çalışılan Gün", ["N", "FM", "YG"]),
    days("Hafta Tatili", ["HT"]),
    days("Genel Tatil", ["RT", "YG"]),
    days("Yıllık İzin", ["Yİ"]),
    days("Ücretsiz İzin", ["Üİ"]),
    days("İstirahat (Rapor)", ["R", "Dİ"]),
    days("Devamsızlık", ["D"]),
    days("Mazeret İzni", ["Mİ", "İİ"]),
    hours("Fazla Mesai %50", "overtime"),
    hours("Hafta Tatili Mesaisi", "weeklyRestWork"),
    hours("Genel Tatil Mesaisi", "holidayWork"),
    hours("Gece Çalışması", "night"),
    hours("Eksik Saat", "missing"),
  ],
  codeMap: {},
}

/** Genel CSV: UTF-8, her gün için hücre kodu */
export const GENERIC_CSV: PayrollProfileSettings = {
  name: "Genel CSV",
  description:
    "UTF-8, ; ayraçlı; her gün için puantaj kodu ve saat toplamları.",
  format: "csv",
  encoding: "utf-8",
  delimiter: ";",
  decimalSeparator: ",",
  includeHeader: true,
  columns: [
    field("Sicil No", "employeeNumber"),
    field("T.C. Kimlik No", "tckn"),
    field("Ad", "firstName"),
    field("Soyad", "lastName"),
    field("Yıl", "periodYear"),
    field("Ay", "periodMonth"),
    { header: "Gün", source: { kind: "dailyCodes" }, width: 3 },
    hours("Fazla Mesai (saat)", "overtime"),
    hours("Gece (saat)", "night"),
  ],
  codeMap: {},
}

export const PAYROLL_LIBRARY: Record<
  LibraryKey,
  { settings: PayrollProfileSettings; simulated: boolean }
> = {
  "logo-bordro-plus": { settings: LOGO_BORDRO_PLUS, simulated: true },
  "generic-csv": { settings: GENERIC_CSV, simulated: false },
}
