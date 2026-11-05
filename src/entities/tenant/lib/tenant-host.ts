/** Alt alan adı olarak kullanılamayan adlar */
export const RESERVED_SLUGS = [
  "www",
  "api",
  "auth",
  "app",
  "admin",
  "mail",
  "static",
  "cdn",
  "status",
] as const

export const PLATFORM_SLUG = "platform"

/**
 * Kiracıyı adresten çözer: `<kiracı>.puantio.com` → "kiracı". Alt alan adı olmayan
 * ortamlarda (localhost, önizleme) `fallback` kullanılır.
 */
export function resolveTenantSlug(options: {
  hostname: string
  baseDomain: string
  fallback: string
}): string {
  const host = options.hostname.toLowerCase()
  const suffix = `.${options.baseDomain.toLowerCase()}`
  if (host.endsWith(suffix)) {
    const label = host.slice(0, -suffix.length)
    if (label && !label.includes(".")) return label
  }
  return options.fallback
}

/** Kiracı kök adresi: `https://<kiracı>.puantio.com/` */
export function buildTenantUrl(slug: string, baseDomain: string): string {
  return `https://${slug}.${baseDomain}/`
}
