import type { RouteObject } from "react-router"

type LazyRoute = Pick<RouteObject, "lazy">

/** Platform paneli (yalnızca platform kiracısında; ayrı chunk). */
export function platformRoutes(): Record<
  "home" | "tenants" | "newTenant" | "tenantDetail" | "support",
  LazyRoute
> {
  const pages = () => import("./routes/platform-pages")
  return {
    home: {
      lazy: async () => ({ Component: (await pages()).PlatformHomePage }),
    },
    tenants: {
      lazy: async () => ({ Component: (await pages()).PlatformTenantsPage }),
    },
    newTenant: {
      lazy: async () => ({ Component: (await pages()).PlatformNewTenantPage }),
    },
    tenantDetail: {
      lazy: async () => ({
        Component: (await pages()).PlatformTenantDetailPage,
      }),
    },
    support: {
      lazy: async () => ({
        Component: (await pages()).PlatformSupportSessionsPage,
      }),
    },
  }
}
