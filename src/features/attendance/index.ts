import type { QueryClient } from "@tanstack/react-query"
import { lazy } from "react"
import type { RouteObject } from "react-router"

/**
 * Modül 1 dashboard'u ana sayfada görünür; grafik kütüphanesi (recharts + d3)
 * giriş paketine girmesin diye tembel yüklenir. `<Suspense>` ile kullanın.
 */
export const AttendanceDashboard = lazy(async () => ({
  default: (await import("./components/attendance-dashboard"))
    .AttendanceDashboard,
}))
export { AttendanceRealtimeBridge } from "./components/attendance-realtime-bridge"
export { attendanceKeys } from "./api/attendance-api"

type LazyRoute = Pick<RouteObject, "lazy">

export function attendanceRoutes(
  _queryClient: QueryClient
): Record<"live" | "alarms" | "records", LazyRoute> {
  return {
    live: {
      lazy: async () => ({
        Component: (await import("./routes/live-page")).LivePage,
      }),
    },
    alarms: {
      lazy: async () => ({
        Component: (await import("./routes/alarms-page")).AlarmsPage,
      }),
    },
    records: {
      lazy: async () => ({
        Component: (await import("./routes/records-page")).RecordsPage,
      }),
    },
  }
}
