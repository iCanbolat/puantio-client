import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"
import { optionListSchema } from "@/shared/types"

import { contractListSchema, type ContractListParams } from "../model/contract"

export const contractKeys = {
  all: ["contracts"] as const,
  lists: () => [...contractKeys.all, "list"] as const,
  list: (params: ContractListParams) =>
    [...contractKeys.lists(), params] as const,
  detail: (id: string) => [...contractKeys.all, "detail", id] as const,
  options: (customerId?: string) =>
    [...contractKeys.all, "options", customerId ?? "all"] as const,
  templates: () => [...contractKeys.all, "templates"] as const,
  headcount: (params: object) =>
    [...contractKeys.all, "headcount", params] as const,
  headcountLocation: (params: object) =>
    [...contractKeys.all, "headcount-location", params] as const,
}

export const contractQueries = {
  list: (params: ContractListParams) =>
    queryOptions({
      queryKey: contractKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/contracts", contractListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
  options: (customerId?: string) =>
    queryOptions({
      queryKey: contractKeys.options(customerId),
      queryFn: ({ signal }) =>
        http
          .get("/contracts/options", optionListSchema, {
            params: { customerId },
            signal,
          })
          .then((data) => data.items),
    }),
}
