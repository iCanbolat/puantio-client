import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { timesheetQueries } from "./api/timesheet-api"

export {
  CELL_CODES,
  CELL_CODE_LABELS,
  EDITABLE_CELL_CODES,
  LEAVE_CELL_CODES,
  cellCodeSchema,
  cellTone,
  type CellCode,
} from "./model/cell-code"
export {
  PERIOD_STATUS_LABELS,
  timesheetPeriodSchema,
  type PeriodStatus,
  type TimesheetPeriod,
} from "./model/timesheet"
export { timesheetKeys, timesheetQueries } from "./api/timesheet-api"
export { monthLabel } from "./components/period-format"
export { CustomerTimesheetApprovals } from "./components/customer-timesheet-approvals"
export { PersonnelTimesheetTab } from "./components/personnel-timesheet-tab"

const noop = () => undefined

export function timesheetRoutes(
  queryClient: QueryClient
): Record<"periods" | "period", Pick<RouteObject, "lazy" | "loader">> {
  return {
    periods: {
      loader: () => {
        queryClient.query(timesheetQueries.periods()).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/periods-page")).PeriodsPage,
      }),
    },
    period: {
      loader: ({ params }) => {
        if (params.periodId)
          queryClient
            .query(timesheetQueries.period(params.periodId))
            .catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/period-page")).PeriodPage,
      }),
    },
  }
}
