import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { http } from "@/shared/api/http"
import { downloadBlob } from "@/shared/lib/download"

import {
  payrollExportListSchema,
  payrollExportSchema,
  payrollPreviewSchema,
  payrollProfileListSchema,
  payrollProfileSchema,
  type ExportRequest,
  type PayrollProfileSettings,
} from "../model/profile"

export const payrollKeys = {
  all: ["payroll"] as const,
  profiles: () => [...payrollKeys.all, "profiles"] as const,
  exports: (periodId?: string) =>
    [...payrollKeys.all, "exports", periodId ?? "all"] as const,
  preview: (request: ExportRequest) =>
    [...payrollKeys.all, "preview", request] as const,
}

const enc = encodeURIComponent

export const payrollQueries = {
  profiles: () =>
    queryOptions({
      queryKey: payrollKeys.profiles(),
      queryFn: ({ signal }) =>
        http.get("/payroll/profiles", payrollProfileListSchema, { signal }),
    }),
  exports: (periodId?: string) =>
    queryOptions({
      queryKey: payrollKeys.exports(periodId),
      queryFn: ({ signal }) =>
        http.get("/payroll-exports", payrollExportListSchema, {
          params: { periodId },
          signal,
        }),
    }),
  preview: (request: ExportRequest) =>
    queryOptions({
      queryKey: payrollKeys.preview(request),
      queryFn: ({ signal }) =>
        http.post("/payroll-exports/preview", payrollPreviewSchema, {
          body: request,
          signal,
        }),
      staleTime: 0,
      // Önizleme T.C. Kimlik No içerir (KVKK): kısa süre bellekte tutulur
      gcTime: 30_000,
    }),
}

export function createPayrollExport(request: ExportRequest) {
  return http.post("/payroll-exports", payrollExportSchema, { body: request })
}

export async function downloadPayrollExport(id: string, fallbackName: string) {
  const { blob, filename } = await http.getBlob(
    `/payroll-exports/${enc(id)}/file`
  )
  downloadBlob(blob, filename ?? fallbackName)
}

export function duplicateProfile(sourceProfileId: string, name: string) {
  return http.post("/payroll/profiles", payrollProfileSchema, {
    body: { sourceProfileId, name },
  })
}

export function updateProfile(id: string, body: PayrollProfileSettings) {
  return http.put(`/payroll/profiles/${enc(id)}`, payrollProfileSchema, {
    body,
  })
}

export function deleteProfile(id: string) {
  return http.delete(`/payroll/profiles/${enc(id)}`, z.undefined())
}

export function setLegalEntityProfile(
  legalEntityId: string,
  profileId: string
) {
  return http.put(
    `/legal-entities/${enc(legalEntityId)}/payroll-profile`,
    z.object({ legalEntityId: z.string(), profileId: z.string() }),
    { body: { profileId } }
  )
}
