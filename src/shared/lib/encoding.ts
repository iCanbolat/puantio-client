/**
 * Metin → bayt kodlayıcıları. Tarayıcıların `TextEncoder`'ı yalnızca UTF-8 üretir; Türk
 * bordro yazılımlarının çoğu (Logo, Netsis, Mikro) CSV/TXT içe aktarımında Windows-1254
 * (Türkçe ANSI) bekler.
 */

export type TextEncodingId = "utf-8" | "windows-1254"

/** 0x80–0x9F bölgesi (Windows-1252 ile ortak; 0x8E ve 0x9E tanımsız) */
const HIGH_CONTROL: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x0178: 0x9f,
}

/** Latin-1'den farklı olan Türkçe harfler */
const TURKISH: Record<number, number> = {
  0x011e: 0xd0, // Ğ
  0x0130: 0xdd, // İ
  0x015e: 0xde, // Ş
  0x011f: 0xf0, // ğ
  0x0131: 0xfd, // ı
  0x015f: 0xfe, // ş
}

/** Windows-1254'te bu Latin-1 kodları Türkçe harflere ayrılmıştır */
const REPLACED_LATIN1 = new Set([0xd0, 0xdd, 0xde, 0xf0, 0xfd, 0xfe])

const UNMAPPABLE = 0x3f // "?"

function toWindows1254Byte(codePoint: number): number {
  if (codePoint < 0x80) return codePoint
  const turkish = TURKISH[codePoint]
  if (turkish !== undefined) return turkish
  const control = HIGH_CONTROL[codePoint]
  if (control !== undefined) return control
  if (codePoint >= 0xa0 && codePoint <= 0xff && !REPLACED_LATIN1.has(codePoint))
    return codePoint
  return UNMAPPABLE
}

/** Metni Windows-1254 baytlarına çevirir; karşılığı olmayan karakterler "?" olur. */
export function encodeWindows1254(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(text.length)
  let index = 0
  for (const char of text) {
    bytes[index] = toWindows1254Byte(char.codePointAt(0) ?? UNMAPPABLE)
    index += 1
  }
  return bytes.slice(0, index)
}

const UTF8_BOM = [0xef, 0xbb, 0xbf]

/**
 * Metni seçilen kodlamayla baytlara çevirir. UTF-8'de Excel'in Türkçe karakterleri doğru
 * açması için BOM eklenebilir.
 */
export function encodeText(
  text: string,
  encoding: TextEncodingId,
  options: { bom?: boolean } = {}
): Uint8Array<ArrayBuffer> {
  if (encoding === "windows-1254") return encodeWindows1254(text)
  const body = new TextEncoder().encode(text)
  if (!options.bom) return body
  const bytes = new Uint8Array(body.length + UTF8_BOM.length)
  bytes.set(UTF8_BOM)
  bytes.set(body, UTF8_BOM.length)
  return bytes
}

/** Windows-1254 baytlarını metne çevirir (testler ve önizleme için). */
export function decodeWindows1254(bytes: Uint8Array): string {
  return new TextDecoder("windows-1254").decode(bytes)
}
