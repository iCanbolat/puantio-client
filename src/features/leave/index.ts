import type { RouteObject } from "react-router"

export { PersonnelLeaveTab } from "./components/personnel-leave-tab"

export function leaveRoutes(): Record<"list", Pick<RouteObject, "lazy">> {
  return {
    list: {
      lazy: async () => ({
        Component: (await import("./routes/leave-page")).LeavePage,
      }),
    },
  }
}
