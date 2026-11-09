import { useMemo } from "react"

import { WorkOrderRealtimeBridge } from "@/features/work-orders"
import { can, useSession } from "@/entities/session"
import { TenantLogo, hasModule, useTenant } from "@/entities/tenant"
import { paths } from "@/shared/config/paths"

import { buildPortalNavigation, filterNavigation } from "./navigation"
import { ShellFrame } from "./panel-layout"

function PortalHeader() {
  const tenant = useTenant()
  return (
    <>
      <TenantLogo tenant={tenant} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-heading font-semibold">
          {tenant.shortName}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          Müşteri portalı
        </span>
      </span>
    </>
  )
}

/**
 * Müşteri portalı kabuğu: kiracı markasıyla açılır, firma iç menüsünü göstermez. Menü
 * müşteri rolünün yetkilerine ve kiracının paketine göre süzülür; veri kapsamını
 * (yalnızca kendi sözleşmeleri) backend uygular.
 */
export function PortalLayout() {
  const tenant = useTenant()
  const me = useSession()
  const sections = useMemo(
    () => filterNavigation(buildPortalNavigation(), { me, tenant }),
    [me, tenant]
  )
  const listensWorkOrders =
    hasModule(tenant, "quality") && can(me, "work_order:read")
  return (
    <>
      <ShellFrame
        sections={sections}
        homePath={paths.portal.home()}
        header={<PortalHeader />}
      />
      {listensWorkOrders ? <WorkOrderRealtimeBridge /> : null}
    </>
  )
}
