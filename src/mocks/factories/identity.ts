import { faker } from "./faker"

/** Geçerli T.C. Kimlik No üretir (checksum'lı). */
export function fakeTckn(): string {
  const digits = [faker.number.int({ min: 1, max: 9 })]
  for (let index = 1; index < 9; index += 1)
    digits.push(faker.number.int({ min: 0, max: 9 }))
  const at = (index: number) => digits[index] ?? 0
  const odd = at(0) + at(2) + at(4) + at(6) + at(8)
  const even = at(1) + at(3) + at(5) + at(7)
  digits.push((((odd * 7 - even) % 10) + 10) % 10)
  digits.push(digits.reduce((sum, digit) => sum + digit, 0) % 10)
  return digits.join("")
}

/** Geçerli Vergi Kimlik No üretir. */
export function fakeVkn(): string {
  const digits = Array.from({ length: 9 }, () =>
    faker.number.int({ min: 0, max: 9 })
  )
  let sum = 0
  digits.forEach((digit, index) => {
    const t = (digit + 9 - index) % 10
    let v = (t * 2 ** (9 - index)) % 9
    if (t !== 0 && v === 0) v = 9
    sum += v
  })
  digits.push((10 - (sum % 10)) % 10)
  return digits.join("")
}

export function fakeTrMobile(): string {
  return `+905${faker.string.numeric(9)}`
}

export function fakeSgkNumber(): string {
  return faker.string.numeric(26)
}

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** QR bildirim token'ı (tahmin edilemez, karışmayan karakterler) */
export function fakeQrToken(): string {
  return faker.string.fromCharacters(TOKEN_ALPHABET, 10)
}

export function fakeNfcUid(): string {
  return Array.from({ length: 7 }, () =>
    faker.string.hexadecimal({ length: 2, casing: "upper", prefix: "" })
  ).join(":")
}
