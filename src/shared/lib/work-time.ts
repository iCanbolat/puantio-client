import { TZDate } from "@date-fns/tz"

import { TIME_ZONE, toIsoDate } from "./date"

/**
 * Vardiya ve puantaj hesapları için takvim yardımcıları. Takvim günleri `YYYY-MM-DD`,
 * saatler `HH:mm` biçimindedir ve her zaman İstanbul saatine göre yorumlanır.
 */

export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isTimeOfDay(value: string): boolean {
  return TIME_PATTERN.test(value)
}

/** "07:30" → 450 */
export function minutesOfDay(time: string): number {
  const match = TIME_PATTERN.exec(time)
  if (!match) throw new RangeError(`Geçersiz saat: ${time}`)
  return Number(match[1]) * 60 + Number(match[2])
}

function parseIsoDate(isoDate: string): [number, number, number] {
  const [year, month, day] = isoDate.split("-").map(Number)
  if (!year || !month || !day)
    throw new RangeError(`Geçersiz tarih: ${isoDate}`)
  return [year, month, day]
}

/** İstanbul'da verilen gün ve saatteki an. */
export function istanbulDateTime(isoDate: string, time = "00:00"): Date {
  const [year, month, day] = parseIsoDate(isoDate)
  const minutes = minutesOfDay(time)
  return new Date(
    new TZDate(
      year,
      month - 1,
      day,
      Math.floor(minutes / 60),
      minutes % 60,
      TIME_ZONE
    )
  )
}

/** Takvim gününe gün ekler (saat diliminden bağımsız). */
export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = parseIsoDate(isoDate)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

/** ISO hafta günü: Pazartesi 1 … Pazar 7 */
export function isoWeekday(isoDate: string): number {
  const [year, month, day] = parseIsoDate(isoDate)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

/** O haftanın pazartesi günü */
export function startOfIsoWeek(isoDate: string): string {
  return addDaysIso(isoDate, 1 - isoWeekday(isoDate))
}

/** `from` ve `to` dahil tüm günler */
export function eachIsoDate(from: string, to: string): string[] {
  const dates: string[] = []
  for (let date = from; date <= to; date = addDaysIso(date, 1)) {
    dates.push(date)
  }
  return dates
}

export function diffIsoDays(from: string, to: string): number {
  const [y1, m1, d1] = parseIsoDate(from)
  const [y2, m2, d2] = parseIsoDate(to)
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS
  )
}

/** "2026-09" → { from: "2026-09-01", to: "2026-09-30", days: 30 } */
export function monthRange(month: string): {
  from: string
  to: string
  days: number
} {
  const [year, monthNumber] = month.split("-").map(Number)
  if (!year || !monthNumber) throw new RangeError(`Geçersiz ay: ${month}`)
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const prefix = `${year}-${String(monthNumber).padStart(2, "0")}`
  return {
    from: `${prefix}-01`,
    to: `${prefix}-${String(days).padStart(2, "0")}`,
    days,
  }
}

/** "2026-09" ± n ay */
export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number)
  const index = (year ?? 0) * 12 + (monthNumber ?? 1) - 1 + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

export function monthOf(value: Date | string): string {
  return (typeof value === "string" ? value : toIsoDate(value)).slice(0, 7)
}

export interface TimeSegment {
  start: string
  end: string
}

/**
 * Vardiya parçasının gerçek aralığı. Bitiş başlangıçtan önceyse (ör. 19:00–07:00)
 * ertesi güne taşar.
 */
export function segmentInterval(
  isoDate: string,
  segment: TimeSegment
): { start: Date; end: Date } {
  const start = istanbulDateTime(isoDate, segment.start)
  const overnight = minutesOfDay(segment.end) <= minutesOfDay(segment.start)
  const end = istanbulDateTime(
    overnight ? addDaysIso(isoDate, 1) : isoDate,
    segment.end
  )
  return { start, end }
}

/** Parça süresi (dakika); gece geçişini hesaba katar */
export function segmentMinutes(segment: TimeSegment): number {
  const start = minutesOfDay(segment.start)
  const end = minutesOfDay(segment.end)
  return end > start ? end - start : 24 * 60 - start + end
}

/** İki aralığın kesişimi (ms) */
export function overlapMs(
  a: { start: number; end: number },
  b: { start: number; end: number }
): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))
}

/** 20:00–06:00 arası gece çalışması (dakika). İş Kanunu md. 69. */
export function nightMinutes(start: Date, end: Date): number {
  let total = 0
  const startMs = start.getTime()
  const endMs = end.getTime()
  for (
    let day = addDaysIso(toIsoDate(start), -1);
    day <= toIsoDate(end);
    day = addDaysIso(day, 1)
  ) {
    const night = {
      start: istanbulDateTime(day, "20:00").getTime(),
      end: istanbulDateTime(addDaysIso(day, 1), "06:00").getTime(),
    }
    total += overlapMs({ start: startMs, end: endMs }, night)
  }
  return Math.round(total / MINUTE_MS)
}

/** Saati yarım saate yuvarlar (bordro saat kolonları): 7,26 → 7,5 */
export function roundToHalfHour(hours: number): number {
  return Math.round(hours * 2) / 2
}
