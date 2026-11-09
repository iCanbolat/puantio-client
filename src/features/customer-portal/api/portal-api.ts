import { queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"
import { downloadBlob } from "@/shared/lib/download"

import {
  monthlyReportSchema,
  portalSummarySchema,
  reportArchiveSchema,
  reportSubscriptionSchema,
  requestOptionsSchema,
  requestReceiptSchema,
  type ReportSubscriptionInput,
} from "../model/portal"
import type { CustomerRequestInput } from "@/features/work-orders"

const enc = encodeURIComponent

export const portalKeys = {
  all: ["portal"] as const,
  summary: () => [...portalKeys.all, "summary"] as const,
  requestOptions: () => [...portalKeys.all, "request-options"] as const,
  reports: () => [...portalKeys.all, "reports"] as const,
  report: (month: string) => [...portalKeys.all, "report", month] as const,
  subscription: () => [...portalKeys.all, "subscription"] as const,
}

export const portalQueries = {
  summary: () =>
    queryOptions({
      queryKey: portalKeys.summary(),
      queryFn: ({ signal }) =>
        http.get("/portal/summary", portalSummarySchema, { signal }),
    }),
  requestOptions: () =>
    queryOptions({
      queryKey: portalKeys.requestOptions(),
      queryFn: ({ signal }) =>
        http.get("/portal/request-options", requestOptionsSchema, { signal }),
      staleTime: 5 * 60_000,
    }),
  reports: () =>
    queryOptions({
      queryKey: portalKeys.reports(),
      queryFn: ({ signal }) =>
        http
          .get("/portal/reports", reportArchiveSchema, { signal })
          .then((data) => data.items),
    }),
  report: (month: string) =>
    queryOptions({
      queryKey: portalKeys.report(month),
      queryFn: ({ signal }) =>
        http.get(`/portal/reports/${enc(month)}`, monthlyReportSchema, {
          signal,
        }),
    }),
  subscription: () =>
    queryOptions({
      queryKey: portalKeys.subscription(),
      queryFn: ({ signal }) =>
        http.get("/portal/report-subscription", reportSubscriptionSchema, {
          signal,
        }),
    }),
}

export function createCustomerRequest(body: CustomerRequestInput) {
  return http.post("/portal/requests", requestReceiptSchema, { body })
}

export function updateSubscription(body: ReportSubscriptionInput) {
  return http.put("/portal/report-subscription", reportSubscriptionSchema, {
    body,
  })
}

export async function downloadReport(month: string) {
  const { blob, filename } = await http.getBlob(
    `/portal/reports/${enc(month)}/export`
  )
  downloadBlob(blob, filename ?? `sla-denetim-raporu-${month}.xlsx`)
}
