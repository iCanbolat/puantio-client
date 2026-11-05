import { http } from "msw"
import { z } from "zod"

import { db } from "@/mocks/db"
import { mockClock } from "@/mocks/clock"
import {
  apiPath,
  noContent,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "@/mocks/http"
import { toIsoDate } from "@/shared/lib/date"
import { includesTr, compareTr } from "@/shared/lib/format"

import {
  SHOWCASE_SORTABLE_FIELDS,
  showcaseListParamsSchema,
  showcaseRecordUpdateSchema,
  type ShowcaseRecord,
} from "../model/showcase-record"

export const showcaseHandlers = [
  http.get(apiPath("/showcase/records"), ({ request }) => {
    const params = parseQuery(request, showcaseListParamsSchema)
    const where = (record: ShowcaseRecord) => {
      if (params.status && record.status !== params.status) return false
      if (params.category && !params.category.includes(record.category))
        return false
      if (params.city && record.city !== params.city) return false
      const updated = toIsoDate(record.updatedAt)
      if (params.updatedFrom && updated < params.updatedFrom) return false
      if (params.updatedTo && updated > params.updatedTo) return false
      return true
    }
    return ok(
      db.showcaseRecords.query(params, {
        where,
        searchFields: ["code", "name", "city"],
        sortableFields: SHOWCASE_SORTABLE_FIELDS,
        defaultSort: { field: "code", order: "asc" },
      })
    )
  }),

  http.get(apiPath("/showcase/records/:id"), ({ params }) => {
    const record = db.showcaseRecords.findById(String(params.id))
    return record ? ok(record) : notFound()
  }),

  http.patch(apiPath("/showcase/records/:id"), async ({ request, params }) => {
    const id = String(params.id)
    if (!db.showcaseRecords.findById(id)) return notFound()
    const body = await parseBody(request, showcaseRecordUpdateSchema)
    if (!body.success) return body.response

    const duplicate = db.showcaseRecords.findFirst(
      (record) =>
        record.id !== id && compareTr(record.name, body.data.name) === 0
    )
    if (duplicate) {
      return problem(422, "VALIDATION_FAILED", "Formda hatalı alanlar var.", {
        name: [`Bu ad ${duplicate.code} kodlu kayıtta kullanılıyor.`],
      })
    }
    const updated = db.showcaseRecords.update(id, {
      ...body.data,
      updatedAt: mockClock.now().toISOString(),
    })
    return ok(updated ?? null)
  }),

  http.delete(apiPath("/showcase/records/:id"), ({ params }) => {
    return db.showcaseRecords.remove(String(params.id))
      ? noContent()
      : notFound()
  }),

  http.get(apiPath("/showcase/cities"), ({ request }) => {
    const { q } = parseQuery(request, z.object({ q: z.string().optional() }))
    const counts = new Map<string, number>()
    for (const record of db.showcaseRecords.findMany()) {
      counts.set(record.city, (counts.get(record.city) ?? 0) + 1)
    }
    const items = [...counts.entries()]
      .filter(([city]) => !q || includesTr(city, q))
      .sort(([a], [b]) => compareTr(a, b))
      .map(([city, count]) => ({ value: city, label: city, count }))
    return ok({ items })
  }),
]
