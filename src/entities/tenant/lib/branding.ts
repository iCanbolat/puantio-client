import { brand } from "@/shared/config/brand"
import { accessibleBrandColor } from "@/shared/lib/color"

import type { TenantConfig } from "../model/tenant-config"

const COLOR_VARIABLES = ["--primary", "--sidebar-primary", "--ring"] as const
const FOREGROUND_VARIABLES = [
  "--primary-foreground",
  "--sidebar-primary-foreground",
] as const

/** Uygulanacak marka rengi: beyaz metinle AA kontrastı sağlamıyorsa `null` (varsayılan tema). */
export function resolveBrandColor(config: TenantConfig): string | null {
  return accessibleBrandColor(config.branding.primaryColor)
}

export function documentTitle(config: TenantConfig, page?: string): string {
  const parts = [page, config.shortName, brand.productName].filter(Boolean)
  return parts.join(" · ")
}

/**
 * Kiracı markasını belgeye uygular: renk değişkenleri, sekme başlığı, favicon.
 * Dönen fonksiyon değişiklikleri geri alır.
 */
export function applyBranding(
  config: TenantConfig,
  root: HTMLElement = document.documentElement
): () => void {
  const color = resolveBrandColor(config)
  if (color) {
    for (const variable of COLOR_VARIABLES)
      root.style.setProperty(variable, color)
    for (const variable of FOREGROUND_VARIABLES)
      root.style.setProperty(variable, "#ffffff")
  }
  root.dataset.tenant = config.slug
  const previousTitle = document.title
  document.title = documentTitle(config)

  let favicon: HTMLLinkElement | null = null
  let previousFavicon: string | null = null
  if (config.branding.faviconUrl) {
    favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (favicon) {
      previousFavicon = favicon.href
      favicon.href = config.branding.faviconUrl
    }
  }

  return () => {
    for (const variable of [...COLOR_VARIABLES, ...FOREGROUND_VARIABLES])
      root.style.removeProperty(variable)
    delete root.dataset.tenant
    document.title = previousTitle
    if (favicon && previousFavicon) favicon.href = previousFavicon
  }
}
