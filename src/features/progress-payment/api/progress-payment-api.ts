import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { http } from "@/shared/api/http"
import { downloadBlob } from "@/shared/lib/download"

import {
  progressPaymentListSchema,
  progressPaymentSchema,
  recalculationPreviewSchema,
  type CreateProgressPaymentInput,
  type ManualPenalty,
  type ProgressPaymentListParams,
  type TransitionInput,
} from "../model/progress-payment"

const enc = encodeURIComponent

export const progressPaymentKeys = {
  all: ["progress-payments"] as const,
  list: (params: ProgressPaymentListParams) =>
    [...progressPaymentKeys.all, "list", params] as const,
  detail: (id: string) => [...progressPaymentKeys.all, "detail", id] as const,
  recalculation: (id: string) =>
    [...progressPaymentKeys.all, "recalculation", id] as const,
  portal: () => [...progressPaymentKeys.all, "portal"] as const,
}

export const progressPaymentQueries = {
  list: (params: ProgressPaymentListParams) =>
    queryOptions({
      queryKey: progressPaymentKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/progress-payments", progressPaymentListSchema, {
          params,
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: progressPaymentKeys.detail(id),
      queryFn: ({ signal }) =>
        http.get(`/progress-payments/${enc(id)}`, progressPaymentSchema, {
          signal,
        }),
    }),
  recalculation: (id: string) =>
    queryOptions({
      queryKey: progressPaymentKeys.recalculation(id),
      queryFn: ({ signal }) =>
        http.get(
          `/progress-payments/${enc(id)}/recalculation`,
          recalculationPreviewSchema,
          { signal }
        ),
    }),
  portal: () =>
    queryOptions({
      queryKey: progressPaymentKeys.portal(),
      queryFn: ({ signal }) =>
        http
          .get(
            "/portal/progress-payments",
            z.object({ items: z.array(progressPaymentSchema) }),
            { signal }
          )
          .then((data) => data.items),
    }),
}

export function createProgressPayment(body: CreateProgressPaymentInput) {
  return http.post("/progress-payments", progressPaymentSchema, { body })
}

export function transitionProgressPayment(id: string, body: TransitionInput) {
  return http.post(
    `/progress-payments/${enc(id)}/transition`,
    progressPaymentSchema,
    { body }
  )
}

export function recalculateProgressPayment(id: string) {
  return http.post(
    `/progress-payments/${enc(id)}/recalculate`,
    progressPaymentSchema
  )
}

export function updatePenalties(id: string, penalties: ManualPenalty[]) {
  return http.put(
    `/progress-payments/${enc(id)}/penalties`,
    progressPaymentSchema,
    { body: { penalties } }
  )
}

export async function downloadProgressPayment(id: string, fallback: string) {
  const { blob, filename } = await http.getBlob(
    `/progress-payments/${enc(id)}/export`
  )
  downloadBlob(blob, filename ?? fallback)
}
