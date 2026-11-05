import { z } from "zod"

/**
 * Türkiye cep telefonu normalizasyonu. Kabul edilen girdiler:
 * "0532 123 45 67", "532-123-4567", "+90 532 123 45 67", "905321234567".
 * Çıktı E.164: "+905321234567". Geçersizse `null`.
 */
export function normalizeTrMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "")
  const national = digits.startsWith("90")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits
  return /^5\d{9}$/.test(national) ? `+90${national}` : null
}

export const trMobileSchema = z.string().transform((value, context) => {
  const normalized = normalizeTrMobile(value)
  if (!normalized) {
    context.addIssue({
      code: "custom",
      message: "Geçerli bir cep telefonu girin (5XX XXX XX XX)",
    })
    return z.NEVER
  }
  return normalized
})

/** "+905321234567" → "+90 532 123 45 67" */
export function formatTrMobile(e164: string): string {
  const national = e164.replace(/^\+90/, "")
  return `+90 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8, 10)}`
}

/** KVKK: "+905321234567" → "+90 532 *** ** 67" */
export function maskTrMobile(e164: string): string {
  const national = e164.replace(/^\+90/, "")
  return `+90 ${national.slice(0, 3)} *** ** ${national.slice(8, 10)}`
}
