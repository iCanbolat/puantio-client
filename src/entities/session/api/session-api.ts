import { queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"

import { meSchema } from "../model/me"

export const sessionKeys = {
  all: ["session"] as const,
  me: () => [...sessionKeys.all, "me"] as const,
}

export function fetchMe(signal?: AbortSignal) {
  return http.get("/me", meSchema, { signal })
}

export const sessionQueries = {
  me: () =>
    queryOptions({
      queryKey: sessionKeys.me(),
      queryFn: ({ signal }) => fetchMe(signal),
      staleTime: 5 * 60_000,
      meta: { silent: true },
    }),
}
