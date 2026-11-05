import { buildTenantUrl } from "@/entities/tenant"
import { env } from "@/shared/config/env"

/**
 * Kiracı adresi. Mock modunda alt alan adı yoktur; aynı origin'de `?kiraci=` ile kiracı
 * değiştirilir ve platform kimliğiyle (`kullanici=destek`) açılır.
 */
export function tenantEntryUrl(slug: string): string {
  if (env.VITE_API_MOCKING) {
    return `${window.location.origin}/?kiraci=${encodeURIComponent(slug)}&kullanici=destek`
  }
  return buildTenantUrl(slug, env.VITE_TENANT_BASE_DOMAIN)
}
