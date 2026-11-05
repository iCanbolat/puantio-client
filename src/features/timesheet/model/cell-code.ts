import { z } from "zod"

import type { LeaveType } from "@/entities/leave"

/**
 * Puantaj hücre kodları. Bordro aktarımında bu kodlar profilin kolonlarına toplanır.
 * `?`: eksik kayıt (giriş var, çıkış yok) → düzeltilmeden bordroya aktarılamaz.
 * `-`: o gün işe girmemiş / ayrılmış (gün sayısına dahil edilmez).
 */
export const CELL_CODES = [
  "N",
  "FM",
  "Yİ",
  "R",
  "D",
  "HT",
  "RT",
  "YG",
  "Üİ",
  "Mİ",
  "Dİ",
  "İİ",
  "?",
  "-",
] as const
export const cellCodeSchema = z.enum(CELL_CODES)
export type CellCode = z.infer<typeof cellCodeSchema>

export const CELL_CODE_LABELS: Record<CellCode, string> = {
  N: "Normal çalışma",
  FM: "Fazla mesai",
  Yİ: "Yıllık izin",
  R: "Rapor (istirahat)",
  D: "Devamsız",
  HT: "Hafta tatili",
  RT: "Resmi tatil",
  YG: "Yarım gün (arefe)",
  Üİ: "Ücretsiz izin",
  Mİ: "Mazeret izni",
  Dİ: "Doğum izni",
  İİ: "İdari izin",
  "?": "Eksik kayıt",
  "-": "İstihdam dışı",
}

/** Puantajda elle girilebilen kodlar */
export const EDITABLE_CELL_CODES = CELL_CODES.filter(
  (code): code is Exclude<CellCode, "?" | "-"> => code !== "?" && code !== "-"
)

export const LEAVE_CELL_CODES: Record<LeaveType, CellCode> = {
  annual: "Yİ",
  sick_report: "R",
  unpaid: "Üİ",
  excuse: "Mİ",
  maternity: "Dİ",
  administrative: "İİ",
}

export const WORKED_CODES: readonly CellCode[] = ["N", "FM"]
export const LEAVE_CODES: readonly CellCode[] = [
  "Yİ",
  "R",
  "Üİ",
  "Mİ",
  "Dİ",
  "İİ",
]

export type CellTone =
  "work" | "leave" | "off" | "absent" | "holiday" | "missing" | "none"

export function cellTone(code: CellCode | null): CellTone {
  if (code === null || code === "-") return "none"
  if (code === "N" || code === "FM") return "work"
  if (code === "D") return "absent"
  if (code === "?") return "missing"
  if (code === "HT") return "off"
  if (code === "RT" || code === "YG") return "holiday"
  return "leave"
}
