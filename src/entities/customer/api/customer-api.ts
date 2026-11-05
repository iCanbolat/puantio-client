import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"
import { optionListSchema } from "@/shared/types"

import {
  customerListSchema,
  customerSchema,
  type CustomerId,
  type CustomerListParams,
  type CustomerPayload,
} from "../model/customer"

export const customerKeys = {
  all: ["customers"] as const,
  lists: () => [...customerKeys.all, "list"] as const,
  list: (params: CustomerListParams) =>
    [...customerKeys.lists(), params] as const,
  detail: (id: string) => [...customerKeys.all, "detail", id] as const,
  options: () => [...customerKeys.all, "options"] as const,
}

export const customerQueries = {
  list: (params: CustomerListParams) =>
    queryOptions({
      queryKey: customerKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/customers", customerListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: customerKeys.detail(id),
      queryFn: ({ signal }) =>
        http.get(`/customers/${encodeURIComponent(id)}`, customerSchema, {
          signal,
        }),
    }),
}

export function fetchCustomerOptions(query: string, signal?: AbortSignal) {
  return http
    .get("/customers/options", optionListSchema, {
      params: { q: query },
      signal,
    })
    .then((data) => data.items)
}

export function createCustomer(body: CustomerPayload) {
  return http.post("/customers", customerSchema, { body })
}

export function updateCustomer(id: CustomerId, body: CustomerPayload) {
  return http.patch(`/customers/${id}`, customerSchema, { body })
}
