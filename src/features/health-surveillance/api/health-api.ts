import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"
import type { ListParams } from "@/shared/types"

import {
  accessLogListSchema,
  healthListSchema,
  revealResponseSchema,
  type HealthListParams,
  type HealthRecordInput,
  type RevealInput,
} from "../model/health"

const enc = encodeURIComponent

/**
 * KVKK: liste maskelidir ve yine de önbellekte tutulmaz (`gcTime: 0`). Açık veri yalnızca
 * gerekçeli görüntüleme isteğinin yanıtında gelir; sorgu önbelleğine hiç yazılmaz.
 */
export const healthKeys = {
  all: ["health"] as const,
  list: (params: HealthListParams) =>
    [...healthKeys.all, "list", params] as const,
  accessLogs: (params: ListParams) =>
    [...healthKeys.all, "access-logs", params] as const,
}

export const healthQueries = {
  list: (params: HealthListParams) =>
    queryOptions({
      queryKey: healthKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/health/records", healthListSchema, { params, signal }),
      placeholderData: keepPreviousData,
      gcTime: 0,
      staleTime: 0,
    }),
  accessLogs: (params: ListParams) =>
    queryOptions({
      queryKey: healthKeys.accessLogs(params),
      queryFn: ({ signal }) =>
        http.get("/health/access-logs", accessLogListSchema, {
          params,
          signal,
        }),
      placeholderData: keepPreviousData,
      gcTime: 0,
      staleTime: 0,
    }),
}

export function revealHealthRecord(personnelId: string, body: RevealInput) {
  return http.post(
    `/health/records/${enc(personnelId)}/reveal`,
    revealResponseSchema,
    { body }
  )
}

export function updateHealthRecord(
  personnelId: string,
  body: HealthRecordInput
) {
  return http.put(`/health/records/${enc(personnelId)}`, revealResponseSchema, {
    body,
  })
}
