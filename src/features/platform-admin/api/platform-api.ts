import { queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"

import {
  platformSupportSessionListSchema,
  platformSupportSessionSchema,
  platformTenantListSchema,
  platformTenantSchema,
  type CreateTenantPayload,
  type StartSupportInput,
  type UpdateTenantPayload,
} from "../model/platform"

export const platformKeys = {
  tenants: ["platform", "tenants"] as const,
  tenant: (slug: string) => ["platform", "tenants", slug] as const,
  sessions: ["platform", "support-sessions"] as const,
}

const enc = encodeURIComponent

export const platformQueries = {
  tenants: () =>
    queryOptions({
      queryKey: platformKeys.tenants,
      queryFn: ({ signal }) =>
        http
          .get("/platform/tenants", platformTenantListSchema, { signal })
          .then((data) => data.items),
    }),
  tenant: (slug: string) =>
    queryOptions({
      queryKey: platformKeys.tenant(slug),
      queryFn: ({ signal }) =>
        http.get(`/platform/tenants/${enc(slug)}`, platformTenantSchema, {
          signal,
        }),
    }),
  sessions: () =>
    queryOptions({
      queryKey: platformKeys.sessions,
      queryFn: ({ signal }) =>
        http
          .get("/platform/support-sessions", platformSupportSessionListSchema, {
            signal,
          })
          .then((data) => data.items),
    }),
}

export const createTenant = (body: CreateTenantPayload) =>
  http.post("/platform/tenants", platformTenantSchema, { body })
export const updateTenant = (slug: string, body: UpdateTenantPayload) =>
  http.patch(`/platform/tenants/${enc(slug)}`, platformTenantSchema, { body })
export const startSupportSession = (slug: string, body: StartSupportInput) =>
  http.post(
    `/platform/tenants/${enc(slug)}/support-sessions`,
    platformSupportSessionSchema,
    { body }
  )
export const endSupportSession = (id: string) =>
  http.post(
    `/platform/support-sessions/${enc(id)}/end`,
    platformSupportSessionSchema
  )
