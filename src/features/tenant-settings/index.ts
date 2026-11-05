import type { RouteObject } from "react-router"

export function tenantSettingsRoutes(): Record<
  "tenant" | "audit",
  Pick<RouteObject, "lazy">
> {
  return {
    tenant: {
      lazy: async () => ({
        Component: (await import("./routes/tenant-settings-page"))
          .TenantSettingsPage,
      }),
    },
    audit: {
      lazy: async () => ({
        Component: (await import("./routes/audit-page")).AuditPage,
      }),
    },
  }
}
