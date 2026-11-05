/**
 * Renk yardımcıları. Kiracı marka rengi uygulanmadan önce WCAG kontrastı denetlenir;
 * düşük kontrastlı renk erişilebilirliği bozacağı için varsayılan renge düşülür.
 */
export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value)
}

/** "#1a2b3c" veya "#abc" → { r, g, b }. Geçersizse `null`. */
export function parseHexColor(value: string): Rgb | null {
  if (!isHexColor(value)) return null
  const hex =
    value.length === 4
      ? value.slice(1).replace(/./g, (char) => char + char)
      : value.slice(1)
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

const channel = (value: number) => {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.1 göreli parlaklık (0–1). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG kontrast oranı (1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  ) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

export const WHITE: Rgb = { r: 255, g: 255, b: 255 }

/** AA (normal metin) eşiği */
export const MIN_CONTRAST_AA = 4.5

/**
 * Marka rengi beyaz metinle (buton, rozet) AA kontrastı sağlıyor mu?
 * Sağlamıyorsa `null` döner ve çağıran varsayılan temaya düşer.
 */
export function accessibleBrandColor(value: string | null): string | null {
  if (!value) return null
  const rgb = parseHexColor(value)
  if (!rgb) return null
  return contrastRatio(rgb, WHITE) >= MIN_CONTRAST_AA ? value : null
}
