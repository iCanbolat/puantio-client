import { TenantLogo, useTenant } from "@/entities/tenant"
import { brand } from "@/shared/config/brand"

/** Yan menü başlığı: kiracı logosu ve adı, altında ürün adı. */
export function TenantHeader() {
  const tenant = useTenant()
  return (
    <>
      <TenantLogo tenant={tenant} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-heading font-semibold">
          {tenant.shortName}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {brand.productName} {brand.tagline}
        </span>
      </span>
    </>
  )
}
