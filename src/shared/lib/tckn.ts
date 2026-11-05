import { z } from "zod"

/**
 * T.C. Kimlik No doğrulaması:
 * - 11 hane, ilk hane 0 olamaz
 * - 10. hane = ((1,3,5,7,9. hanelerin toplamı × 7) − (2,4,6,8. hanelerin toplamı)) mod 10
 * - 11. hane = ilk 10 hanenin toplamı mod 10
 */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false
  const digits = Array.from(value, Number)
  const at = (index: number) => digits[index] ?? 0

  const oddSum = at(0) + at(2) + at(4) + at(6) + at(8)
  const evenSum = at(1) + at(3) + at(5) + at(7)
  const tenth = (((oddSum * 7 - evenSum) % 10) + 10) % 10
  if (tenth !== at(9)) return false

  const firstTenSum = digits.slice(0, 10).reduce((sum, digit) => sum + digit, 0)
  return firstTenSum % 10 === at(10)
}

export const tcknSchema = z
  .string()
  .trim()
  .regex(/^\d{11}$/, "T.C. Kimlik No 11 haneli olmalı")
  .refine(isValidTckn, "Geçersiz T.C. Kimlik No")

/** KVKK: listelerde yalnızca son 2 hane görünür → "*********46". */
export function maskTckn(value: string): string {
  if (value.length <= 2) return "*".repeat(value.length)
  return "*".repeat(value.length - 2) + value.slice(-2)
}
