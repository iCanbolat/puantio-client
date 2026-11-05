import { useMemo } from "react"

import { useSession } from "@/entities/session"
import { useTenant } from "@/entities/tenant"
import { paths } from "@/shared/config/paths"

import { buildPlatformNavigation, filterNavigation } from "./navigation"
import { ShellFrame } from "./panel-layout"
import { TenantHeader } from "./tenant-header"

/** Puantio işletmecisinin platform paneli (`platform.puantio.com`). */
export function PlatformLayout() {
  const me = useSession()
  const tenant = useTenant()
  const sections = useMemo(
    () => filterNavigation(buildPlatformNavigation(), { me, tenant }),
    [me, tenant]
  )
  return (
    <ShellFrame
      sections={sections}
      homePath={paths.platform.home()}
      header={<TenantHeader />}
    />
  )
}
