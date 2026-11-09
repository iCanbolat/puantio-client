import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { http } from "@/shared/api/http"

import {
  auditListSchema,
  auditPlanSchema,
  auditSchema,
  auditTemplateListSchema,
  auditTemplateSchema,
  auditTrendSchema,
  auditorOptionsSchema,
  type AuditListParams,
  type AuditPlanInput,
  type AuditTemplateInput,
  type AuditTrendParams,
  type SubmitAuditInput,
} from "../model/audit"

const enc = encodeURIComponent

export const qualityKeys = {
  all: ["quality"] as const,
  audits: (params: AuditListParams) =>
    [...qualityKeys.all, "audits", params] as const,
  audit: (id: string) => [...qualityKeys.all, "audit", id] as const,
  trend: (params: AuditTrendParams) =>
    [...qualityKeys.all, "trend", params] as const,
  templates: () => [...qualityKeys.all, "templates"] as const,
  template: (id: string) => [...qualityKeys.all, "template", id] as const,
  plan: (month: string | undefined) =>
    [...qualityKeys.all, "plan", month ?? "current"] as const,
  auditors: () => [...qualityKeys.all, "auditors"] as const,
}

export const qualityQueries = {
  audits: (params: AuditListParams) =>
    queryOptions({
      queryKey: qualityKeys.audits(params),
      queryFn: ({ signal }) =>
        http.get("/audits", auditListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
  audit: (id: string) =>
    queryOptions({
      queryKey: qualityKeys.audit(id),
      queryFn: ({ signal }) =>
        http.get(`/audits/${enc(id)}`, auditSchema, { signal }),
      // Fotoğraf adresleri 5 dk geçerli imzalı URL'dir
      staleTime: 60_000,
    }),
  trend: (params: AuditTrendParams) =>
    queryOptions({
      queryKey: qualityKeys.trend(params),
      queryFn: ({ signal }) =>
        http.get("/audits/trend", auditTrendSchema, { params, signal }),
    }),
  templates: () =>
    queryOptions({
      queryKey: qualityKeys.templates(),
      queryFn: ({ signal }) =>
        http
          .get("/audit-templates", auditTemplateListSchema, { signal })
          .then((data) => data.items),
    }),
  template: (id: string) =>
    queryOptions({
      queryKey: qualityKeys.template(id),
      queryFn: ({ signal }) =>
        http.get(`/audit-templates/${enc(id)}`, auditTemplateSchema, {
          signal,
        }),
    }),
  plan: (month: string | undefined) =>
    queryOptions({
      queryKey: qualityKeys.plan(month),
      queryFn: ({ signal }) =>
        http.get("/audit-plans", auditPlanSchema, {
          params: { ay: month },
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  auditors: () =>
    queryOptions({
      queryKey: qualityKeys.auditors(),
      queryFn: ({ signal }) =>
        http
          .get("/audit-plans/auditors", auditorOptionsSchema, { signal })
          .then((data) => data.items),
      staleTime: 5 * 60_000,
    }),
}

export function createTemplate(body: AuditTemplateInput) {
  return http.post("/audit-templates", auditTemplateSchema, { body })
}

export function updateTemplate(id: string, body: AuditTemplateInput) {
  return http.put(`/audit-templates/${enc(id)}`, auditTemplateSchema, { body })
}

export function createPlan(body: AuditPlanInput) {
  return http.post("/audit-plans", z.object({ id: z.string() }), { body })
}

export function removePlan(id: string) {
  return http.delete(`/audit-plans/${enc(id)}`, z.undefined())
}

/** Saha uygulamasının gönderim kontratı (web'de yalnızca dev paneli simülasyonu kullanır) */
export function submitAudit(body: SubmitAuditInput) {
  return http.post("/audits", auditSchema, { body })
}
