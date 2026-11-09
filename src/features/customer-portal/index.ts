import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { portalQueries } from "./api/portal-api"

export * from "./model/portal"
export { buildMonthlyReport } from "./domain/report"
export { portalKeys, portalQueries } from "./api/portal-api"

const noop = () => undefined

type PortalRoute =
  | "home"
  | "workOrders"
  | "workOrder"
  | "request"
  | "reports"
  | "reportSettings"
  | "reportPrint"

/** Müşteri portalı sayfaları (lazy chunk'lar) */
export function customerPortalRoutes(
  queryClient: QueryClient
): Record<PortalRoute, Pick<RouteObject, "lazy" | "loader">> {
  return {
    home: {
      loader: () => {
        queryClient.query(portalQueries.summary()).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/portal-home-page")).PortalHomePage,
      }),
    },
    workOrders: {
      lazy: async () => ({
        Component: (await import("./routes/portal-work-orders-page"))
          .PortalWorkOrdersPage,
      }),
    },
    workOrder: {
      lazy: async () => ({
        Component: (await import("./routes/portal-work-order-detail-page"))
          .PortalWorkOrderDetailPage,
      }),
    },
    request: {
      lazy: async () => ({
        Component: (await import("./routes/portal-request-page"))
          .PortalRequestPage,
      }),
    },
    reports: {
      lazy: async () => ({
        Component: (await import("./routes/portal-reports-page"))
          .PortalReportsPage,
      }),
    },
    reportSettings: {
      lazy: async () => ({
        Component: (await import("./routes/portal-report-settings-page"))
          .PortalReportSettingsPage,
      }),
    },
    reportPrint: {
      lazy: async () => ({
        Component: (await import("./routes/portal-report-print-page"))
          .PortalReportPrintPage,
      }),
    },
  }
}
