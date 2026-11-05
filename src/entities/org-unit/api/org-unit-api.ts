import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { http } from "@/shared/api/http"

import {
  orgUnitListSchema,
  orgUnitSchema,
  type OrgUnitId,
  type OrgUnitInput,
} from "../model/org-unit"

export const orgUnitKeys = {
  all: ["org-units"] as const,
  list: () => [...orgUnitKeys.all, "list"] as const,
}

export const orgUnitQueries = {
  list: () =>
    queryOptions({
      queryKey: orgUnitKeys.list(),
      queryFn: ({ signal }) =>
        http
          .get("/org-units", orgUnitListSchema, { signal })
          .then((data) => data.items),
      staleTime: 5 * 60_000,
    }),
}

export function createOrgUnit(body: OrgUnitInput) {
  return http.post("/org-units", orgUnitSchema, { body })
}

export function updateOrgUnit(id: OrgUnitId, body: OrgUnitInput) {
  return http.patch(`/org-units/${id}`, orgUnitSchema, { body })
}

export function deleteOrgUnit(id: OrgUnitId) {
  return http.delete(`/org-units/${id}`, z.undefined())
}
