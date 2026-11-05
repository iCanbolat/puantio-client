import { z } from "zod"

/**
 * Para birimi kuruş cinsinden tam sayı olarak tutulur. Kayan nokta hatalarını önlemek için
 * tüm hesaplamalar bu modüldeki fonksiyonlarla yapılır.
 *
 * Yuvarlama kuralı (tek kaynak): **yarım yukarı, sıfırdan uzağa** (half-up / away from zero).
 * 0,005 TL → 0,01 TL; -0,005 TL → -0,01 TL.
 */
export const kurusSchema = z.number().int().brand("Kurus")
export type Kurus = z.infer<typeof kurusSchema>

/** Kayan nokta gürültüsünü temizleyip yarım yukarı yuvarlar. */
export function roundHalfUp(value: number): number {
  const sign = value < 0 ? -1 : 1
  const cleaned = Math.round(Math.abs(value) * 1e6) / 1e6
  const rounded = Math.floor(cleaned + 0.5)
  return rounded === 0 ? 0 : sign * rounded
}

export function kurus(value: number): Kurus {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Kuruş değeri tam sayı olmalı: ${value}`)
  }
  return value as Kurus
}

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/

function decimalStringToKurus(value: string): Kurus {
  const match = DECIMAL_PATTERN.exec(value)
  if (!match) {
    throw new RangeError(`Geçersiz tutar: ${value}`)
  }
  const [, minus, whole = "0", fraction = ""] = match
  const digits = fraction.padEnd(3, "0")
  let result = Number(whole) * 100 + Number(digits.slice(0, 2))
  if (Number(digits[2]) >= 5) result += 1
  return kurus(result === 0 ? 0 : minus ? -result : result)
}

/** TL cinsinden sayıyı kuruşa çevirir (1.005 → 101). */
export function toKurus(tl: number): Kurus {
  if (!Number.isFinite(tl)) {
    throw new RangeError(`Geçersiz tutar: ${tl}`)
  }
  return decimalStringToKurus(tl.toFixed(10))
}

/**
 * Türkçe biçimli tutar metnini kuruşa çevirir: "1.234,56" → 123456, "12,5 ₺" → 1250.
 * Geçersiz girdide `null` döner.
 */
export function parseTl(input: string): Kurus | null {
  const normalized = input
    .replace(/[₺\s]/g, "")
    .replace(/TL$/i, "")
    .replace(/\./g, "")
    .replace(",", ".")
  if (!DECIMAL_PATTERN.test(normalized)) return null
  return decimalStringToKurus(normalized)
}

/** Yalnızca görüntüleme amaçlı: kuruşu TL sayısına çevirir. */
export function fromKurus(value: Kurus): number {
  return value / 100
}

export function addKurus(...values: Kurus[]): Kurus {
  return kurus(values.reduce<number>((sum, value) => sum + value, 0))
}

export function subtractKurus(a: Kurus, b: Kurus): Kurus {
  return kurus(a - b)
}

/** Kuruş tutarını bir çarpanla çarpar ve tek yuvarlama kuralını uygular. */
export function multiplyKurus(value: Kurus, factor: number): Kurus {
  return kurus(roundHalfUp(value * factor))
}

/** Yüzde hesabı: `percentOf(10000, 20)` → 2000 (KDV %20). */
export function percentOf(value: Kurus, percent: number): Kurus {
  return multiplyKurus(value, percent / 100)
}

/**
 * Toplamı ağırlıklara göre kuruş kaybı olmadan paylaştırır (en büyük kalan yöntemi).
 * Parçaların toplamı her zaman `total`'e eşittir. Kıst (pro-rata) hesaplarda kullanılır.
 */
export function allocateKurus(
  total: Kurus,
  weights: readonly number[]
): Kurus[] {
  if (weights.length === 0) return []
  if (weights.some((weight) => weight < 0 || !Number.isFinite(weight))) {
    throw new RangeError("Ağırlıklar negatif olmayan sonlu sayılar olmalı")
  }
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  if (weightSum === 0) {
    throw new RangeError("Ağırlıkların toplamı sıfır olamaz")
  }

  const sign = total < 0 ? -1 : 1
  const absolute = Math.abs(total)
  const raw = weights.map((weight) => (absolute * weight) / weightSum)
  const floors = raw.map((value) => Math.floor(value))
  let remainder = absolute - floors.reduce((sum, value) => sum + value, 0)

  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  for (const { index } of order) {
    if (remainder <= 0) break
    floors[index] = (floors[index] ?? 0) + 1
    remainder -= 1
  }

  return floors.map((value) => kurus(value === 0 ? 0 : sign * value))
}
