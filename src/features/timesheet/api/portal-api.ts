import { queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"

import { timesheetPeriodListSchema } from "../model/timesheet"
import { timesheetKeys } from "./timesheet-api"

export const portalApprovalsQuery = () =>
  queryOptions({
    queryKey: [...timesheetKeys.all, "portal-approvals"] as const,
    queryFn: ({ signal }) =>
      http.get("/portal/timesheet-approvals", timesheetPeriodListSchema, {
        signal,
      }),
  })
