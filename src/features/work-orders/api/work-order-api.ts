import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { http } from "@/shared/api/http"
import { defineRealtimeEvent } from "@/shared/api/realtime"

import {
  assigneeOptionsSchema,
  issueCatalogSchema,
  uploadedFileSchema,
  workOrderBoardSchema,
  workOrderListSchema,
  workOrderSchema,
  type CreateWorkOrderInput,
  type IssueCatalog,
  type TransitionInput,
  type WorkOrderListParams,
} from "../model/work-order"

const enc = encodeURIComponent

export const workOrderKeys = {
  all: ["work-orders"] as const,
  list: (params: WorkOrderListParams) =>
    [...workOrderKeys.all, "list", params] as const,
  board: (params: WorkOrderListParams) =>
    [...workOrderKeys.all, "board", params] as const,
  detail: (id: string) => [...workOrderKeys.all, "detail", id] as const,
  assignees: (id: string) => [...workOrderKeys.all, "assignees", id] as const,
  catalog: () => ["issue-catalog"] as const,
}

export const workOrderQueries = {
  list: (params: WorkOrderListParams) =>
    queryOptions({
      queryKey: workOrderKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/work-orders", workOrderListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
  board: (params: WorkOrderListParams) =>
    queryOptions({
      queryKey: workOrderKeys.board(params),
      queryFn: ({ signal }) =>
        http.get("/work-orders/board", workOrderBoardSchema, {
          params: { ...params, page: undefined, pageSize: undefined },
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: workOrderKeys.detail(id),
      queryFn: ({ signal }) =>
        http.get(`/work-orders/${enc(id)}`, workOrderSchema, { signal }),
    }),
  catalog: () =>
    queryOptions({
      queryKey: workOrderKeys.catalog(),
      queryFn: ({ signal }) =>
        http.get("/issue-catalog", issueCatalogSchema, { signal }),
    }),
}

/** Atama adayları: lokasyondaki personel önce, sonra yedek havuzu (sunucu taraflı arama) */
export function fetchAssignees(id: string, q: string, signal?: AbortSignal) {
  return http
    .get(`/work-orders/${enc(id)}/assignees`, assigneeOptionsSchema, {
      params: { q },
      signal,
    })
    .then((data) => data.items)
}

export function createWorkOrder(body: CreateWorkOrderInput) {
  return http.post("/work-orders", workOrderSchema, { body })
}

export function transitionWorkOrder(id: string, body: TransitionInput) {
  return http.post(`/work-orders/${enc(id)}/transition`, workOrderSchema, {
    body,
  })
}

export function uploadPhoto(file: File) {
  const body = new FormData()
  body.set("file", file)
  return http.post("/uploads", uploadedFileSchema, { body })
}

export function updateIssueCatalog(body: IssueCatalog) {
  return http.put("/issue-catalog", issueCatalogSchema, { body })
}

const workOrderPayload = z.object({
  tenantId: z.string(),
  workOrderId: z.string(),
  locationId: z.string(),
})

/** Gerçek zamanlı iş emri olayları: liste, pano ve detay sorguları tazelenir */
export const workOrderEvents = {
  created: defineRealtimeEvent("work_order.created", workOrderPayload),
  updated: defineRealtimeEvent("work_order.updated", workOrderPayload),
}
