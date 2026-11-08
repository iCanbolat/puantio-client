import { queryOptions } from "@tanstack/react-query"

import { contractKeys } from "@/entities/contract"
import { http } from "@/shared/api/http"
import { downloadBlob } from "@/shared/lib/download"

import {
  contractSchema,
  contractTemplateListSchema,
  contractTemplateSchema,
  headcountLocationDetailSchema,
  headcountReportSchema,
  type AddendumInput,
  type ContractCreateInput,
  type ContractTemplateInput,
} from "../model/contract"

const enc = encodeURIComponent

export interface HeadcountQuery {
  month: string
  contractId?: string | undefined
  orgUnitId?: string | undefined
}

export const contractDetailQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: contractKeys.detail(id),
      queryFn: ({ signal }) =>
        http.get(`/contracts/${enc(id)}`, contractSchema, { signal }),
    }),
  templates: () =>
    queryOptions({
      queryKey: contractKeys.templates(),
      queryFn: ({ signal }) =>
        http
          .get("/contract-templates", contractTemplateListSchema, { signal })
          .then((data) => data.items),
    }),
  headcount: (query: HeadcountQuery) =>
    queryOptions({
      queryKey: contractKeys.headcount(query),
      queryFn: ({ signal }) =>
        http.get("/contracts/headcount", headcountReportSchema, {
          params: { ...query },
          signal,
        }),
    }),
  headcountLocation: (contractId: string, locationId: string, month: string) =>
    queryOptions({
      queryKey: contractKeys.headcountLocation({
        contractId,
        locationId,
        month,
      }),
      queryFn: ({ signal }) =>
        http.get(
          `/contracts/${enc(contractId)}/headcount/locations/${enc(locationId)}`,
          headcountLocationDetailSchema,
          { params: { month }, signal }
        ),
    }),
}

export function createContract(body: ContractCreateInput) {
  return http.post("/contracts", contractSchema, { body })
}

export function addAddendum(contractId: string, body: AddendumInput) {
  return http.post(`/contracts/${enc(contractId)}/versions`, contractSchema, {
    body,
  })
}

export function createTemplate(body: ContractTemplateInput) {
  return http.post("/contract-templates", contractTemplateSchema, { body })
}

export function updateTemplate(id: string, body: ContractTemplateInput) {
  return http.put(`/contract-templates/${enc(id)}`, contractTemplateSchema, {
    body,
  })
}

export async function downloadHeadcountReport(query: HeadcountQuery) {
  const { blob, filename } = await http.getBlob("/contracts/headcount/export", {
    params: { ...query },
  })
  downloadBlob(blob, filename ?? `kadro-raporu-${query.month}.xlsx`)
}
