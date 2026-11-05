import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"

import {
  personnelDetailSchema,
  personnelListSchema,
  type PersonnelListParams,
  type PersonnelPayload,
} from "../model/personnel"

export const personnelKeys = {
  all: ["personnel"] as const,
  lists: () => [...personnelKeys.all, "list"] as const,
  list: (params: PersonnelListParams) =>
    [...personnelKeys.lists(), params] as const,
  detail: (id: string) => [...personnelKeys.all, "detail", id] as const,
}

const enc = encodeURIComponent

export const personnelQueries = {
  list: (params: PersonnelListParams) =>
    queryOptions({
      queryKey: personnelKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/personnel", personnelListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: personnelKeys.detail(id),
      queryFn: ({ signal }) =>
        http.get(`/personnel/${enc(id)}`, personnelDetailSchema, { signal }),
      // KVKK: tam TCKN/telefon içeren yanıt bellekte uzun tutulmaz
      gcTime: 60_000,
    }),
}

export function createPersonnel(body: PersonnelPayload) {
  return http.post("/personnel", personnelDetailSchema, { body })
}

export function updatePersonnel(id: string, body: PersonnelPayload) {
  return http.patch(`/personnel/${enc(id)}`, personnelDetailSchema, { body })
}
