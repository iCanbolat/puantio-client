import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { optionListSchema } from "@/shared/types"
import { http } from "@/shared/api/http"
import { downloadBlob } from "@/shared/lib/download"

import {
  auditPackSchema,
  certificateListSchema,
  certificateSchema,
  certificateSummarySchema,
  ohsOverviewSchema,
  ohsSettingsSchema,
  personnelOhsSchema,
  trainingCandidatesSchema,
  trainingSessionListSchema,
  trainingSessionSchema,
  trainingStatusListSchema,
  type AttendanceInput,
  type CertificateInput,
  type CertificateListParams,
  type OhsSettings,
  type TrainingSessionInput,
  type TrainingStatusParams,
} from "../model/ohs"

const enc = encodeURIComponent

export const ohsKeys = {
  all: ["ohs"] as const,
  settings: () => [...ohsKeys.all, "settings"] as const,
  overview: () => [...ohsKeys.all, "overview"] as const,
  sessions: () => [...ohsKeys.all, "sessions"] as const,
  trainingStatus: (params: Omit<TrainingStatusParams, "sekme">) =>
    [...ohsKeys.all, "training-status", params] as const,
  candidates: (typeId: string, locationId: string | null, q: string) =>
    [...ohsKeys.all, "candidates", typeId, locationId, q] as const,
  certificates: (params: CertificateListParams) =>
    [...ohsKeys.all, "certificates", params] as const,
  certificateSummary: () => [...ohsKeys.all, "certificate-summary"] as const,
  personnel: (id: string) => [...ohsKeys.all, "personnel", id] as const,
  auditPack: (locationId: string, portal: boolean) =>
    [
      ...ohsKeys.all,
      "audit-pack",
      portal ? "portal" : "panel",
      locationId,
    ] as const,
  portalLocations: () => [...ohsKeys.all, "portal-locations"] as const,
}

export const ohsQueries = {
  settings: () =>
    queryOptions({
      queryKey: ohsKeys.settings(),
      queryFn: ({ signal }) =>
        http.get("/ohs/settings", ohsSettingsSchema, { signal }),
      staleTime: 5 * 60_000,
    }),
  overview: () =>
    queryOptions({
      queryKey: ohsKeys.overview(),
      queryFn: ({ signal }) =>
        http.get("/ohs/overview", ohsOverviewSchema, { signal }),
    }),
  sessions: () =>
    queryOptions({
      queryKey: ohsKeys.sessions(),
      queryFn: ({ signal }) =>
        http
          .get("/ohs/training-sessions", trainingSessionListSchema, { signal })
          .then((data) => data.items),
    }),
  trainingStatus: (params: Omit<TrainingStatusParams, "sekme">) =>
    queryOptions({
      queryKey: ohsKeys.trainingStatus(params),
      queryFn: ({ signal }) =>
        http.get("/ohs/training-status", trainingStatusListSchema, {
          params,
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  candidates: (typeId: string, locationId: string | null, q: string) =>
    queryOptions({
      queryKey: ohsKeys.candidates(typeId, locationId, q),
      queryFn: ({ signal }) =>
        http
          .get("/ohs/training-candidates", trainingCandidatesSchema, {
            params: {
              typeId,
              locationId: locationId ?? undefined,
              q: q || undefined,
            },
            signal,
          })
          .then((data) => data.items),
      enabled: typeId !== "",
    }),
  certificates: (params: CertificateListParams) =>
    queryOptions({
      queryKey: ohsKeys.certificates(params),
      queryFn: ({ signal }) =>
        http.get("/ohs/certificates", certificateListSchema, {
          params,
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  certificateSummary: () =>
    queryOptions({
      queryKey: ohsKeys.certificateSummary(),
      queryFn: ({ signal }) =>
        http.get("/ohs/certificates/summary", certificateSummarySchema, {
          signal,
        }),
    }),
  personnel: (id: string) =>
    queryOptions({
      queryKey: ohsKeys.personnel(id),
      queryFn: ({ signal }) =>
        http.get(`/ohs/personnel/${enc(id)}`, personnelOhsSchema, { signal }),
      // Belge adresleri 5 dk geçerli imzalı URL'dir
      staleTime: 60_000,
    }),
  auditPack: (locationId: string, portal = false) =>
    queryOptions({
      queryKey: ohsKeys.auditPack(locationId, portal),
      queryFn: ({ signal }) =>
        http.get(
          `/${portal ? "portal" : "ohs"}/audit-pack/${enc(locationId)}`,
          auditPackSchema,
          { signal }
        ),
      enabled: locationId !== "",
    }),
  portalLocations: () =>
    queryOptions({
      queryKey: ohsKeys.portalLocations(),
      queryFn: ({ signal }) =>
        http
          .get("/portal/audit-pack/locations", optionListSchema, { signal })
          .then((data) => data.items),
      staleTime: 5 * 60_000,
    }),
}

export function updateOhsSettings(body: OhsSettings) {
  return http.put("/ohs/settings", ohsSettingsSchema, { body })
}

export function createTrainingSession(body: TrainingSessionInput) {
  return http.post("/ohs/training-sessions", trainingSessionSchema, { body })
}

export function recordAttendance(id: string, body: AttendanceInput) {
  return http.post(
    `/ohs/training-sessions/${enc(id)}/attendance`,
    trainingSessionSchema,
    { body }
  )
}

export function createCertificate(body: CertificateInput) {
  return http.post("/ohs/certificates", certificateSchema, { body })
}

export async function downloadAuditPack(
  locationId: string,
  options: { portal?: boolean; code?: string } = {}
) {
  const { blob, filename } = await http.getBlob(
    `/${options.portal ? "portal" : "ohs"}/audit-pack/${enc(locationId)}/export`
  )
  downloadBlob(
    blob,
    filename ?? `isg-denetim-paketi-${options.code ?? locationId}.xlsx`
  )
}
