import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { shiftQueries } from "@/entities/shift"

export { PersonnelShiftsTab } from "./components/personnel-shifts-tab"
export {
  evaluateSchedule,
  type RuleShift,
  type RuleViolation,
} from "./domain/rules"

const noop = () => undefined

export function schedulingRoutes(
  queryClient: QueryClient
): Record<"board" | "templates", Pick<RouteObject, "lazy" | "loader">> {
  return {
    board: {
      loader: () => {
        queryClient.query(shiftQueries.templates()).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/planning-page")).PlanningPage,
      }),
    },
    templates: {
      lazy: async () => ({
        Component: (await import("./routes/templates-page")).TemplatesPage,
      }),
    },
  }
}
