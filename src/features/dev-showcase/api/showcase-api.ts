import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { http } from "@/shared/api/http"

import {
  citySuggestionSchema,
  showcaseListSchema,
  showcaseRecordSchema,
  type ShowcaseListParams,
  type ShowcaseRecordId,
  type ShowcaseRecordUpdate,
} from "../model/showcase-record"

export const showcaseKeys = {
  all: ["showcase"] as const,
  lists: () => [...showcaseKeys.all, "list"] as const,
  list: (params: ShowcaseListParams) =>
    [...showcaseKeys.lists(), params] as const,
  cities: () => [...showcaseKeys.all, "cities"] as const,
}

export function fetchShowcaseRecords(
  params: ShowcaseListParams,
  signal?: AbortSignal
) {
  return http.get("/showcase/records", showcaseListSchema, { params, signal })
}

export function fetchCitySuggestions(query: string, signal?: AbortSignal) {
  return http
    .get("/showcase/cities", citySuggestionSchema, {
      params: { q: query },
      signal,
    })
    .then(({ items }) =>
      items.map((item) => ({
        value: item.value,
        label: item.label,
        description: `${item.count} kayıt`,
      }))
    )
}

export function updateShowcaseRecord(
  id: ShowcaseRecordId,
  body: ShowcaseRecordUpdate
) {
  return http.patch(`/showcase/records/${id}`, showcaseRecordSchema, { body })
}

export function deleteShowcaseRecord(id: ShowcaseRecordId) {
  return http.delete(`/showcase/records/${id}`, z.undefined())
}

export const showcaseQueries = {
  list: (params: ShowcaseListParams) =>
    queryOptions({
      queryKey: showcaseKeys.list(params),
      queryFn: ({ signal }) => fetchShowcaseRecords(params, signal),
      placeholderData: keepPreviousData,
    }),
}
