import { queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"

import {
  legalEntityListSchema,
  legalEntitySchema,
  type LegalEntityId,
  type LegalEntityInput,
} from "../model/legal-entity"

export const legalEntityKeys = {
  all: ["legal-entities"] as const,
  list: () => [...legalEntityKeys.all, "list"] as const,
}

export const legalEntityQueries = {
  list: () =>
    queryOptions({
      queryKey: legalEntityKeys.list(),
      queryFn: ({ signal }) =>
        http
          .get("/legal-entities", legalEntityListSchema, { signal })
          .then((data) => data.items),
      staleTime: 5 * 60_000,
    }),
}

export function createLegalEntity(body: LegalEntityInput) {
  return http.post("/legal-entities", legalEntitySchema, { body })
}

export function updateLegalEntity(id: LegalEntityId, body: LegalEntityInput) {
  return http.patch(`/legal-entities/${id}`, legalEntitySchema, { body })
}
