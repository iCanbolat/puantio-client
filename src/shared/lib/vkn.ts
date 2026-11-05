import { z } from "zod"

/**
 * Vergi Kimlik Numarası (VKN) doğrulaması (10 hane, Gelir İdaresi algoritması):
 * i = 0..8 için t = (d[i] + 9 − i) mod 10, v = t·2^(9−i) mod 9 (t ≠ 0 ve v = 0 ise v = 9);
 * son hane = (10 − Σv mod 10) mod 10.
 */
export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false
  const digits = Array.from(value, Number)
  let sum = 0
  for (let index = 0; index < 9; index += 1) {
    const t = ((digits[index] ?? 0) + 9 - index) % 10
    let v = (t * 2 ** (9 - index)) % 9
    if (t !== 0 && v === 0) v = 9
    sum += v
  }
  return (10 - (sum % 10)) % 10 === digits[9]
}

export const vknSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Vergi kimlik numarası 10 haneli olmalı")
  .refine(isValidVkn, "Geçersiz vergi kimlik numarası")

/** SGK işyeri sicil numarası: 26 hane (rakam). Biçim denetimi; içerik doğrulamasını SGK yapar. */
export const sgkWorkplaceNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{26}$/, "SGK işyeri sicil numarası 26 haneli olmalı")
