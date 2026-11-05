import { queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"

import { tenantConfigSchema } from "../model/tenant-config"

export const tenantKeys = {
  all: ["tenant"] as const,
  config: (slug: string) => [...tenantKeys.all, "config", slug] as const,
}

export function fetchTenantConfig(slug: string, signal?: AbortSignal) {
  return http.get("/public/tenant-config", tenantConfigSchema, {
    params: { tenant: slug },
    signal,
  })
}

export const tenantQueries = {
  config: (slug: string) =>
    queryOptions({
      queryKey: tenantKeys.config(slug),
      queryFn: ({ signal }) => fetchTenantConfig(slug, signal),
      staleTime: 5 * 60_000,
      meta: { silent: true },
    }),
}
