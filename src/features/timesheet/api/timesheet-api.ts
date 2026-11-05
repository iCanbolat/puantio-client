import { queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"

import {
  timesheetCellSchema,
  timesheetGridSchema,
  timesheetPeriodListSchema,
  timesheetPeriodSchema,
  type CellUpdate,
  type PeriodAction,
  type TimesheetGridParams,
} from "../model/timesheet"

export const timesheetKeys = {
  all: ["timesheet"] as const,
  periods: (legalEntityId?: string) =>
    [...timesheetKeys.all, "periods", legalEntityId ?? "all"] as const,
  period: (id: string) => [...timesheetKeys.all, "period", id] as const,
  grid: (id: string, params: TimesheetGridParams) =>
    [...timesheetKeys.all, "grid", id, params] as const,
}

const enc = encodeURIComponent

export const timesheetQueries = {
  periods: (legalEntityId?: string) =>
    queryOptions({
      queryKey: timesheetKeys.periods(legalEntityId),
      queryFn: ({ signal }) =>
        http.get("/timesheet/periods", timesheetPeriodListSchema, {
          params: { legalEntityId },
          signal,
        }),
    }),
  period: (id: string) =>
    queryOptions({
      queryKey: timesheetKeys.period(id),
      queryFn: ({ signal }) =>
        http.get(`/timesheet/periods/${enc(id)}`, timesheetPeriodSchema, {
          signal,
        }),
    }),
  grid: (id: string, params: TimesheetGridParams) =>
    queryOptions({
      queryKey: timesheetKeys.grid(id, params),
      queryFn: ({ signal }) =>
        http.get(`/timesheet/periods/${enc(id)}/rows`, timesheetGridSchema, {
          params,
          signal,
        }),
    }),
}

export function updateTimesheetCell(periodId: string, body: CellUpdate) {
  return http.patch(
    `/timesheet/periods/${enc(periodId)}/cells`,
    timesheetCellSchema,
    {
      body,
    }
  )
}

export function transitionPeriod(periodId: string, action: PeriodAction) {
  return http.post(
    `/timesheet/periods/${enc(periodId)}/transition`,
    timesheetPeriodSchema,
    { body: { action } }
  )
}
