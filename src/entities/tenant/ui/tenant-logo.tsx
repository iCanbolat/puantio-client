import { cn } from "@/shared/lib/utils"

import { tenantInitials } from "../lib/initials"
import type { TenantConfig } from "../model/tenant-config"

/** Kiracı logosu; yoksa baş harfler. Dekoratiftir, firma adı yanında metin olarak yazılır. */
export function TenantLogo({
  tenant,
  className,
}: {
  tenant: Pick<TenantConfig, "displayName" | "branding">
  className?: string
}) {
  if (tenant.branding.logoUrl) {
    return (
      <img
        src={tenant.branding.logoUrl}
        alt=""
        className={cn("size-8 shrink-0 rounded-xl object-contain", className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground",
        className
      )}
    >
      {tenantInitials(tenant.displayName)}
    </span>
  )
}
