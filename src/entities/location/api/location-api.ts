import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"
import { optionListSchema } from "@/shared/types"

import {
  areaListSchema,
  areaSchema,
  tagLabelListSchema,
  tagListSchema,
  tagSchema,
  type AreaInput,
} from "../model/area-tag"
import {
  locationListSchema,
  locationMapPointsSchema,
  locationSchema,
  type LocationInput,
  type LocationListParams,
} from "../model/location"

type LocationFilters = Omit<LocationListParams, "gorunum">

export const locationKeys = {
  all: ["locations"] as const,
  lists: () => [...locationKeys.all, "list"] as const,
  list: (params: LocationFilters) => [...locationKeys.lists(), params] as const,
  mapPoints: (
    params: Omit<LocationFilters, "page" | "pageSize" | "sort" | "order">
  ) => [...locationKeys.all, "map", params] as const,
  detail: (id: string) => [...locationKeys.all, "detail", id] as const,
  areas: (id: string) => [...locationKeys.detail(id), "areas"] as const,
  tags: (id: string) => [...locationKeys.detail(id), "tags"] as const,
  labels: (ids: readonly string[]) =>
    [...locationKeys.all, "labels", [...ids].sort()] as const,
  options: () => [...locationKeys.all, "options"] as const,
}

const enc = encodeURIComponent

export const locationQueries = {
  list: (params: LocationFilters) =>
    queryOptions({
      queryKey: locationKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/locations", locationListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
  mapPoints: (
    params: Omit<LocationFilters, "page" | "pageSize" | "sort" | "order">
  ) =>
    queryOptions({
      queryKey: locationKeys.mapPoints(params),
      queryFn: ({ signal }) =>
        http
          .get("/locations/map-points", locationMapPointsSchema, {
            params,
            signal,
          })
          .then((data) => data.items),
      staleTime: 60_000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: locationKeys.detail(id),
      queryFn: ({ signal }) =>
        http.get(`/locations/${enc(id)}`, locationSchema, { signal }),
    }),
  areas: (id: string) =>
    queryOptions({
      queryKey: locationKeys.areas(id),
      queryFn: ({ signal }) =>
        http
          .get(`/locations/${enc(id)}/areas`, areaListSchema, { signal })
          .then((data) => data.items),
    }),
  tags: (id: string) =>
    queryOptions({
      queryKey: locationKeys.tags(id),
      queryFn: ({ signal }) =>
        http
          .get(`/locations/${enc(id)}/tags`, tagListSchema, { signal })
          .then((data) => data.items),
    }),
  labels: (ids: readonly string[]) =>
    queryOptions({
      queryKey: locationKeys.labels(ids),
      queryFn: ({ signal }) =>
        http
          .get("/tags/labels", tagLabelListSchema, {
            params: { locationId: ids },
            signal,
          })
          .then((data) => data.items),
    }),
}

export function fetchLocationOptions(query: string, signal?: AbortSignal) {
  return http
    .get("/locations/options", optionListSchema, {
      params: { q: query },
      signal,
    })
    .then((data) => data.items)
}

export function createLocation(body: LocationInput) {
  return http.post("/locations", locationSchema, { body })
}

export function updateLocation(id: string, body: LocationInput) {
  return http.patch(`/locations/${enc(id)}`, locationSchema, { body })
}

export function createArea(locationId: string, body: AreaInput) {
  return http.post(`/locations/${enc(locationId)}/areas`, areaSchema, { body })
}

export function updateArea(areaId: string, body: AreaInput) {
  return http.patch(`/areas/${enc(areaId)}`, areaSchema, { body })
}

export function regenerateQrTag(body: {
  targetType: "location" | "area"
  targetId: string
}) {
  return http.post("/tags/qr", tagSchema, { body })
}

export function assignNfcTag(body: {
  targetType: "location" | "area"
  targetId: string
  value: string
}) {
  return http.post("/tags/nfc", tagSchema, { body })
}
