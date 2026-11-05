import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"

import {
  leaveBalanceSchema,
  leaveDecisionResultSchema,
  leaveListSchema,
  leaveSchema,
  type LeaveDecision,
  type LeaveListParams,
  type LeavePayload,
} from "../model/leave"

export const leaveKeys = {
  all: ["leave"] as const,
  lists: () => [...leaveKeys.all, "list"] as const,
  list: (params: LeaveListParams) => [...leaveKeys.lists(), params] as const,
  balance: (personnelId: string) =>
    [...leaveKeys.all, "balance", personnelId] as const,
}

const enc = encodeURIComponent

export const leaveQueries = {
  list: (params: LeaveListParams) =>
    queryOptions({
      queryKey: leaveKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/leaves", leaveListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
  balance: (personnelId: string) =>
    queryOptions({
      queryKey: leaveKeys.balance(personnelId),
      queryFn: ({ signal }) =>
        http.get(
          `/personnel/${enc(personnelId)}/leave-balance`,
          leaveBalanceSchema,
          {
            signal,
          }
        ),
    }),
}

export function createLeave(body: LeavePayload) {
  return http.post("/leaves", leaveSchema, { body })
}

export function decideLeave(id: string, body: LeaveDecision) {
  return http.post(`/leaves/${enc(id)}/decision`, leaveDecisionResultSchema, {
    body,
  })
}

export function cancelLeave(id: string) {
  return http.post(`/leaves/${enc(id)}/cancel`, leaveSchema)
}
