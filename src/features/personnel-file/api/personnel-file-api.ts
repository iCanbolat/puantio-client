import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"
import { downloadBlob } from "@/shared/lib/download"

import {
  personnelFileListSchema,
  personnelFileSchema,
  personnelFileSummarySchema,
  type DocumentInput,
  type PersonnelFileListParams,
} from "../model/personnel-file"

const enc = encodeURIComponent

export const personnelFileKeys = {
  all: ["personnel-file"] as const,
  list: (params: PersonnelFileListParams) =>
    [...personnelFileKeys.all, "list", params] as const,
  detail: (id: string) => [...personnelFileKeys.all, "detail", id] as const,
  summary: (id: string) => [...personnelFileKeys.all, "summary", id] as const,
}

export const personnelFileQueries = {
  list: (params: PersonnelFileListParams) =>
    queryOptions({
      queryKey: personnelFileKeys.list(params),
      queryFn: ({ signal }) =>
        http.get("/personnel-files", personnelFileListSchema, {
          params,
          signal,
        }),
      placeholderData: keepPreviousData,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: personnelFileKeys.detail(id),
      queryFn: ({ signal }) =>
        http.get(`/personnel-files/${enc(id)}`, personnelFileSchema, {
          signal,
        }),
      // Belge adresleri 5 dk geçerli imzalı URL; kişisel veri kısa süre tutulur
      staleTime: 60_000,
      gcTime: 60_000,
    }),
  summary: (id: string) =>
    queryOptions({
      queryKey: personnelFileKeys.summary(id),
      queryFn: ({ signal }) =>
        http.get(
          `/personnel-files/${enc(id)}/summary`,
          personnelFileSummarySchema,
          { signal }
        ),
    }),
}

export function addDocument(personnelId: string, body: DocumentInput) {
  return http.post(
    `/personnel-files/${enc(personnelId)}/documents`,
    personnelFileSchema,
    { body }
  )
}

export async function downloadMissingReport(
  params: Pick<PersonnelFileListParams, "orgUnitId" | "durum" | "q">
) {
  const { blob, filename } = await http.getBlob("/personnel-files/export", {
    params: { ...params },
  })
  downloadBlob(blob, filename ?? "ozluk-eksik-belge.xlsx")
}
