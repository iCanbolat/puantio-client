import { TZDate } from "@date-fns/tz"
import { z } from "zod"

/** Tüm iş kuralları ve gösterimler İstanbul saatine göre yapılır. */
export const TIME_ZONE = "Europe/Istanbul"

export type DateInput = Date | string | number

export function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Geçersiz tarih: ${String(value)}`)
  }
  return date
}

/** Tarihi İstanbul saat dilimine sabitlenmiş bir `TZDate` olarak döndürür. */
export function inIstanbul(value: DateInput): TZDate {
  return new TZDate(toDate(value).getTime(), TIME_ZONE)
}

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** İstanbul'a göre takvim günü: "2026-09-25". */
export function toIsoDate(value: DateInput): string {
  return isoDateFormatter.format(toDate(value))
}

export function isSameIstanbulDay(a: DateInput, b: DateInput): boolean {
  return toIsoDate(a) === toIsoDate(b)
}

/** İstanbul'da o günün 00:00'ı (UTC anı olarak). */
export function startOfIstanbulDay(value: DateInput): Date {
  const [year, month, day] = toIsoDate(value).split("-").map(Number)
  return new Date(
    new TZDate(year ?? 1970, (month ?? 1) - 1, day ?? 1, TIME_ZONE)
  )
}

/** API'de takvim günleri `YYYY-MM-DD` biçiminde taşınır. */
export const isoDateSchema = z.iso.date()

/** API'de anlar ISO 8601 (saat dilimi ofsetli) taşınır. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true })
