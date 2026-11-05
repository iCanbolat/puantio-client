import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { tenantConfigSchema } from "@/entities/tenant"
import { http } from "@/shared/api/http"

import {
  auditListSchema,
  type AuditListParams,
  type TenantSettingsPayload,
} from "../model/tenant-settings"

export function updateTenantSettings(body: TenantSettingsPayload) {
  return http.patch("/tenant/settings", tenantConfigSchema, { body })
}

export const auditKeys = {
  all: ["audit-events"] as const,
  list: (params: AuditListParams) => [...auditKeys.all, params] as const,
}

export const auditQueries = {
  list: (params: AuditListParams) =>
    queryOptions({
      queryKey: auditKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/audit-events", auditListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
}
