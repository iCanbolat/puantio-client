import type { RouteObject } from "react-router"

export * from "./model/health"
export { healthKeys } from "./api/health-api"
export { PersonnelHealthTab } from "./components/personnel-health-tab"

/**
 * Sağlık gözetimi sayfaları. Veri önceden çekilmez (loader yok): maskeli liste bile
 * yalnızca sayfa açıkken istenir ve önbellekte tutulmaz.
 */
export function healthRoutes(): Record<
  "list" | "accessLogs",
  Pick<RouteObject, "lazy">
> {
  return {
    list: {
      lazy: async () => ({
        Component: (await import("./routes/health-list-page")).HealthListPage,
      }),
    },
    accessLogs: {
      lazy: async () => ({
        Component: (await import("./routes/access-log-page")).AccessLogPage,
      }),
    },
  }
}
