import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

export { AttendanceDashboard } from "./components/attendance-dashboard"
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
