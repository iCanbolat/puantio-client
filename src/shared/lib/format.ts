import { formatDistance } from "date-fns"
import { tr } from "date-fns/locale"

import { TIME_ZONE, toDate, type DateInput } from "./date"
import type { Kurus } from "./money"

export const LOCALE = "tr-TR"

const collator = new Intl.Collator(LOCALE, { sensitivity: "base" })

const moneyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const plainMoneyFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
})

const longDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  weekday: "long",
})

/** Kuruş → "₺1.234,56". `symbol: false` ile "1.234,56". */
export function formatMoney(value: Kurus, options: { symbol?: boolean } = {}) {
  const tl = value / 100
  return options.symbol === false
    ? plainMoneyFormatter.format(tl)
    : moneyFormatter.format(tl)
}

export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  return new Intl.NumberFormat(LOCALE, options).format(value)
}

/** Oran → yüzde: 0.0667 → "%6,7". */
export function formatPercent(ratio: number, fractionDigits = 1): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(ratio)
}

/** "25.09.2026" */
export function formatDate(value: DateInput): string {
  return dateFormatter.format(toDate(value))
}

/** "25.09.2026 14:05" */
export function formatDateTime(value: DateInput): string {
  return dateTimeFormatter.format(toDate(value)).replace(",", "")
}

/** "14:05" */
export function formatTime(value: DateInput): string {
  return timeFormatter.format(toDate(value))
}

/** "25 Eylül 2026 Cuma" */
export function formatDateLong(value: DateInput): string {
  return longDateFormatter.format(toDate(value))
}

/** "3 dakika önce" / "2 saat sonra" */
export function formatRelative(value: DateInput, now: DateInput): string {
  return formatDistance(toDate(value), toDate(now), {
    addSuffix: true,
    locale: tr,
  })
}

const pad = (value: number) => String(value).padStart(2, "0")

/** Geri sayım biçimi: 905_000 ms → "15:05", 3_725_000 → "1:02:05", negatif → "-02:15". */
export function formatCountdown(ms: number): string {
  const negative = ms < 0
  const totalSeconds = Math.floor(Math.abs(ms) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const body =
    hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`
  return negative ? `-${body}` : body
}

/** Süre biçimi: 3_900_000 ms → "1 sa 5 dk", 90_000 → "1 dk 30 sn". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(Math.abs(ms) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} sa`)
  if (minutes > 0) parts.push(`${minutes} dk`)
  if (hours === 0 && seconds > 0) parts.push(`${seconds} sn`)
  return parts.length > 0 ? parts.join(" ") : "0 sn"
}

/** Türkçe harf sırasına göre karşılaştırma (Ç, Ğ, I/İ, Ö, Ş, Ü). */
export function compareTr(a: string, b: string): number {
  return collator.compare(a, b)
}

export function sortByTr<T>(
  items: readonly T[],
  getKey: (item: T) => string
): T[] {
  return [...items].sort((a, b) => compareTr(getKey(a), getKey(b)))
}

export const toUpperTr = (value: string) => value.toLocaleUpperCase(LOCALE)
export const toLowerTr = (value: string) => value.toLocaleLowerCase(LOCALE)

const TR_FOLD: Record<string, string> = {
  ı: "i",
  ş: "s",
  ğ: "g",
  ü: "u",
  ö: "o",
  ç: "c",
}

/**
 * Arama için Türkçe katlama: küçük harfe çevirir ve Türkçe karakterleri ASCII karşılığına
 * indirger. Klavyesinde Türkçe karakter olmayan kullanıcı "sisli" yazıp "Şişli"yi bulabilir.
 */
export function foldTr(value: string): string {
  return toLowerTr(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ışğüöç]/g, (char) => TR_FOLD[char] ?? char)
}

/** Aramada Türkçe büyük/küçük harf ve karakter duyarsız eşleşme ("DIYAR" ~ "Diyarbakır"). */
export function includesTr(haystack: string, needle: string): boolean {
  return foldTr(haystack).includes(foldTr(needle))
}
