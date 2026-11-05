import { useEffect } from "react"
import { Outlet } from "react-router"

import { applyBranding, useTenant } from "@/entities/tenant"

import { TenantSuspendedPage } from "../routes/status-pages"

/** Kiracı markasını belgeye uygular; askıya alınmış kiracıda uygulama açılmaz. */
export function RootLayout() {
  const tenant = useTenant()
  useEffect(() => applyBranding(tenant), [tenant])
  if (tenant.status === "suspended") return <TenantSuspendedPage />
  return <Outlet />
}
