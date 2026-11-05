import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { http } from "@/shared/api/http"

import {
  locationScheduleSchema,
  personnelShiftsSchema,
  scheduleBatchResultSchema,
  shiftTemplateListSchema,
  shiftTemplateSchema,
  type ScheduleBatch,
  type ShiftTemplatePayload,
} from "../model/shift"

export const shiftKeys = {
  all: ["shift"] as const,
  templates: () => [...shiftKeys.all, "templates"] as const,
  schedules: () => [...shiftKeys.all, "schedule"] as const,
  schedule: (locationId: string, from: string, to: string) =>
    [...shiftKeys.schedules(), locationId, from, to] as const,
  personnel: (personnelId: string, from: string, to: string) =>
    [...shiftKeys.all, "personnel", personnelId, from, to] as const,
}

const enc = encodeURIComponent

export const shiftQueries = {
  templates: () =>
    queryOptions({
      queryKey: shiftKeys.templates(),
      queryFn: ({ signal }) =>
        http.get("/shift-templates", shiftTemplateListSchema, { signal }),
      staleTime: 5 * 60_000,
    }),
  schedule: (locationId: string, from: string, to: string) =>
    queryOptions({
      queryKey: shiftKeys.schedule(locationId, from, to),
      queryFn: ({ signal }) =>
        http.get("/schedule", locationScheduleSchema, {
          params: { locationId, from, to },
          signal,
        }),
    }),
  personnel: (personnelId: string, from: string, to: string) =>
    queryOptions({
      queryKey: shiftKeys.personnel(personnelId, from, to),
      queryFn: ({ signal }) =>
        http.get(
          `/personnel/${enc(personnelId)}/shifts`,
          personnelShiftsSchema,
          {
            params: { from, to },
            signal,
          }
        ),
    }),
}

export function saveSchedule(body: ScheduleBatch) {
  return http.post("/schedule/batch", scheduleBatchResultSchema, { body })
}

export function createShiftTemplate(body: ShiftTemplatePayload) {
  return http.post("/shift-templates", shiftTemplateSchema, { body })
}

export function updateShiftTemplate(id: string, body: ShiftTemplatePayload) {
  return http.patch(`/shift-templates/${enc(id)}`, shiftTemplateSchema, {
    body,
  })
}

export function setShiftTemplateActive(id: string, isActive: boolean) {
  return http.patch(`/shift-templates/${enc(id)}/status`, shiftTemplateSchema, {
    body: { isActive },
  })
}

export const locationAttendanceRulesSchema = z.object({
  locationId: z.string(),
  lateToleranceMinutes: z.number().int().min(0).max(60).nullable(),
  alarmSlaMinutes: z.number().int().min(5).max(120).nullable(),
})
export type LocationAttendanceRules = z.infer<
  typeof locationAttendanceRulesSchema
>

export const locationAttendanceRulesQuery = (locationId: string) =>
  queryOptions({
    queryKey: [...shiftKeys.all, "location-rules", locationId] as const,
    queryFn: ({ signal }) =>
      http.get(
        `/locations/${enc(locationId)}/attendance-rules`,
        locationAttendanceRulesSchema,
        { signal }
      ),
  })

export function updateLocationAttendanceRules(
  locationId: string,
  body: Omit<LocationAttendanceRules, "locationId">
) {
  return http.put(
    `/locations/${enc(locationId)}/attendance-rules`,
    locationAttendanceRulesSchema,
    { body }
  )
}
