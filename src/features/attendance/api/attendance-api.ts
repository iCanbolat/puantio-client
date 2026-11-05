import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { http } from "@/shared/api/http"
import { defineRealtimeEvent } from "@/shared/api/realtime"

import {
  alarmListSchema,
  alarmSchema,
  attendanceDashboardSchema,
  attendanceRecordListSchema,
  attendanceRecordSchema,
  backupCandidateListSchema,
  liveBoardSchema,
  shiftDetailSchema,
  type AlarmListParams,
  type AttendanceRecordParams,
  type CloseReason,
  type CorrectionPayload,
  type LiveBoardParams,
} from "../model/attendance"

/** Canlı bağlantı yokken yenileme aralığı */
export const ATTENDANCE_POLL_MS = 15_000

export const attendanceKeys = {
  all: ["attendance"] as const,
  live: (params: LiveBoardParams) =>
    [...attendanceKeys.all, "live", params] as const,
  shift: (id: string) => [...attendanceKeys.all, "shift", id] as const,
  alarms: (params: AlarmListParams) =>
    [...attendanceKeys.all, "alarms", params] as const,
  candidates: (alarmId: string) =>
    [...attendanceKeys.all, "candidates", alarmId] as const,
  records: (params: AttendanceRecordParams) =>
    [...attendanceKeys.all, "records", params] as const,
  dashboard: (orgUnitId?: string) =>
    [...attendanceKeys.all, "dashboard", orgUnitId ?? "all"] as const,
}

const enc = encodeURIComponent

export const attendanceQueries = {
  live: (params: LiveBoardParams) =>
    queryOptions({
      queryKey: attendanceKeys.live(params),
      queryFn: ({ signal }) =>
        http.get("/attendance/live", liveBoardSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
  shift: (id: string) =>
    queryOptions({
      queryKey: attendanceKeys.shift(id),
      queryFn: ({ signal }) =>
        http.get(`/attendance/shifts/${enc(id)}`, shiftDetailSchema, {
          signal,
        }),
      // İmzalı fotoğraf adresi kısa ömürlüdür; önbellekte tutulmaz
      gcTime: 0,
      staleTime: 0,
    }),
  alarms: (params: AlarmListParams) =>
    queryOptions({
      queryKey: attendanceKeys.alarms(params),
      queryFn: ({ signal }) =>
        http.get("/alarms", alarmListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
  candidates: (alarmId: string) =>
    queryOptions({
      queryKey: attendanceKeys.candidates(alarmId),
      queryFn: ({ signal }) =>
        http.get(
          `/alarms/${enc(alarmId)}/backup-candidates`,
          backupCandidateListSchema,
          { signal }
        ),
      staleTime: 0,
    }),
  records: (params: AttendanceRecordParams) =>
    queryOptions({
      queryKey: attendanceKeys.records(params),
      queryFn: ({ signal }) =>
        http.get("/attendance/records", attendanceRecordListSchema, {
          params,
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  dashboard: (orgUnitId?: string) =>
    queryOptions({
      queryKey: attendanceKeys.dashboard(orgUnitId),
      queryFn: ({ signal }) =>
        http.get("/dashboard/attendance", attendanceDashboardSchema, {
          params: { orgUnitId },
          signal,
        }),
      staleTime: 60_000,
    }),
}

export function assignBackup(alarmId: string, personnelId: string) {
  return http.post(`/alarms/${enc(alarmId)}/backup`, alarmSchema, {
    body: { personnelId },
  })
}

export function addAlarmNote(alarmId: string, text: string) {
  return http.post(`/alarms/${enc(alarmId)}/notes`, alarmSchema, {
    body: { text },
  })
}

export function closeAlarm(
  alarmId: string,
  body: { reason: CloseReason; note?: string }
) {
  return http.post(`/alarms/${enc(alarmId)}/close`, alarmSchema, { body })
}

export function correctAttendance(shiftId: string, body: CorrectionPayload) {
  return http.post(
    `/attendance/records/${enc(shiftId)}/correction`,
    attendanceRecordSchema,
    { body }
  )
}

const alarmPayload = z.object({ tenantId: z.string(), alarmId: z.string() })
const shiftPayload = z.object({ tenantId: z.string(), shiftId: z.string() })

/** Gerçek zamanlı olaylar: cache'e işlenir (ilgili sorgular tazelenir) */
export const attendanceEvents = {
  alarmCreated: defineRealtimeEvent("alarm.created", alarmPayload),
  alarmUpdated: defineRealtimeEvent("alarm.updated", alarmPayload),
  alarmResolved: defineRealtimeEvent("alarm.resolved", alarmPayload),
  checkedIn: defineRealtimeEvent("attendance.checked_in", shiftPayload),
  attendanceUpdated: defineRealtimeEvent("attendance.updated", shiftPayload),
}
