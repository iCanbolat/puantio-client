import { http } from "@/shared/api/http"

import {
  importBatchResponseSchema,
  importCheckResponseSchema,
  type DuplicateStrategy,
  type ImportEntity,
} from "../model/import-definitions"

/** Sistemde zaten bulunan anahtarlar (TCKN, kod, VKN) */
export function checkExisting(entity: ImportEntity, keys: string[]) {
  return http
    .post(`/import/${entity}/check`, importCheckResponseSchema, {
      body: { keys },
    })
    .then((data) => data.existing)
}

export function importBatch(
  entity: ImportEntity,
  rows: Record<string, unknown>[],
  duplicateStrategy: DuplicateStrategy
) {
  return http.post(`/import/${entity}/batch`, importBatchResponseSchema, {
    body: { rows, duplicateStrategy },
    timeoutMs: 60_000,
  })
}
