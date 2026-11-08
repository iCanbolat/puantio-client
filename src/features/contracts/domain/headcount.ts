import { eachIsoDate, isoWeekday, monthRange } from "@/shared/lib/work-time"

import type { Coverage } from "../model/contract"

/**
 * Planlı iş günleri: vardiya kapsamına göre ayın günleri.
 * - `weekdays`: Pzt–Cum, `six_days`: Pzt–Cmt; ikisinde de tam gün resmi tatil hariç
 *   (arefe yarım günü planlı iş günü sayılır).
 * - `all_days`: 7/24 hizmet; her gün planlıdır.
 * `scope` lokasyonun sözleşme kapsamındaki tarih aralığıdır (dahil).
 */
export function plannedDates(
  coverage: Coverage,
  range: { from: string; to: string },
  fullHolidays: ReadonlySet<string>
): string[] {
  if (range.from > range.to) return []
  return eachIsoDate(range.from, range.to).filter((date) => {
    if (coverage === "all_days") return true
    if (fullHolidays.has(date)) return false
    const weekday = isoWeekday(date)
    return coverage === "weekdays" ? weekday <= 5 : weekday <= 6
  })
}

/** Ayın tamamındaki planlı iş günü sayısı (günlük birim fiyatın paydası) */
export function plannedDaysInMonth(
  coverage: Coverage,
  month: string,
  fullHolidays: ReadonlySet<string>
): number {
  return plannedDates(coverage, monthRange(month), fullHolidays).length
}

/** İki aralığın kesişimi (yoksa `null`) */
export function intersectRange(
  a: { from: string; to: string | null },
  b: { from: string; to: string }
): { from: string; to: string } | null {
  const from = a.from > b.from ? a.from : b.from
  const to = a.to === null || a.to > b.to ? b.to : a.to
  return from <= to ? { from, to } : null
}

/**
 * **Fiili kadro = planlı iş günlerinde çalışılan kişi-gün ÷ planlı iş günü sayısı.**
 * Çalışılan kişi-gün puantaj kodlarından gelir: N ve FM = 1, YG (arefe) = 0,5. Planlı
 * olmayan günlerde (ör. 6 gün kapsamda Pazar) yapılan çalışma kadroya sayılmaz. Sonuç tek
 * ondalığa yuvarlanır.
 */
export function actualHeadcount(
  workedPersonDays: number,
  plannedDayCount: number
): number {
  if (plannedDayCount === 0) return 0
  return Math.round((workedPersonDays / plannedDayCount) * 10) / 10
}

export interface HeadcountGap {
  committed: number
  actual: number
  /** fiili − taahhüt (negatif: eksik) */
  difference: number
  /** |fark| ÷ taahhüt */
  ratio: number
}

export function headcountGap(committed: number, actual: number): HeadcountGap {
  const difference = Math.round((actual - committed) * 10) / 10
  return {
    committed,
    actual,
    difference,
    ratio: committed === 0 ? 0 : Math.abs(difference) / committed,
  }
}

/** "120 / 112, −8 (%6,7)" */
export function formatHeadcountGap(gap: HeadcountGap): string {
  const number = (value: number) =>
    new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)
  const percent = new Intl.NumberFormat("tr-TR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(gap.ratio)
  const sign = gap.difference < 0 ? "−" : gap.difference > 0 ? "+" : "±"
  return `${number(gap.committed)} / ${number(gap.actual)}, ${sign}${number(Math.abs(gap.difference))} (${percent})`
}

/** Çalışılan gün katsayısı (puantaj özetiyle aynı kural) */
export function workedFraction(code: string | null): number {
  if (code === "N" || code === "FM") return 1
  if (code === "YG") return 0.5
  return 0
}
