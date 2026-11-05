import { describe, expect, it } from "vitest"

import type { ApiError } from "@/shared/api/errors"
import { http } from "@/shared/api/http"
import { db } from "@/mocks/db"
import { toIsoDate } from "@/shared/lib/date"

import {
  deleteShowcaseRecord,
  fetchCitySuggestions,
  fetchShowcaseRecords,
  updateShowcaseRecord,
} from "../api/showcase-api"
import {
  showcaseListParamsSchema,
  type ShowcaseRecordId,
} from "../model/showcase-record"

const params = (input: Record<string, unknown> = {}) =>
  showcaseListParamsSchema.parse(input)

describe("vitrin API sözleşmesi (mock)", () => {
  it("filtreler: durum, çoklu kategori, şehir, tarih aralığı", async () => {
    const all = db.showcaseRecords.findMany()
    const city = all[0]!.city

    const byStatus = await fetchShowcaseRecords(
      params({ status: "aktif", pageSize: 100 })
    )
    expect(byStatus.items.every((item) => item.status === "aktif")).toBe(true)
    expect(byStatus.meta.total).toBe(
      all.filter((item) => item.status === "aktif").length
    )

    const byCategory = await fetchShowcaseRecords(
      params({ category: ["banka", "hastane"], pageSize: 100 })
    )
    expect(
      byCategory.items.every((item) =>
        ["banka", "hastane"].includes(item.category)
      )
    ).toBe(true)

    const byCity = await fetchShowcaseRecords(params({ city, pageSize: 100 }))
    expect(byCity.items.every((item) => item.city === city)).toBe(true)

    const day = toIsoDate(all[0]!.updatedAt)
    const byDate = await fetchShowcaseRecords(
      params({ updatedFrom: day, updatedTo: day, pageSize: 100 })
    )
    expect(byDate.items.length).toBeGreaterThan(0)
    expect(
      byDate.items.every((item) => toIsoDate(item.updatedAt) === day)
    ).toBe(true)
  })

  it("arama ve sıralama sunucu tarafında yapılır", async () => {
    const page = await fetchShowcaseRecords(
      params({ sort: "score", order: "desc", pageSize: 10 })
    )
    const scores = page.items.map((item) => item.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))

    const code = await fetchShowcaseRecords(params({ q: "WLC-00007" }))
    expect(code.items.map((item) => item.code)).toEqual(["WLC-00007"])
  })

  it("şehir önerileri Türkçe duyarsız aranır", async () => {
    const options = await fetchCitySuggestions("ISTANBUL")
    const all = await fetchCitySuggestions("")
    expect(all.length).toBeGreaterThan(1)
    for (const option of options)
      expect(option.label.toLocaleLowerCase("tr")).toContain("istanbul")
  })

  it("güncelleme: benzersiz ad kuralı 422 döner", async () => {
    const [first, second] = db.showcaseRecords.findMany()
    const error = (await updateShowcaseRecord(second!.id, {
      name: first!.name,
      score: 80,
      status: "aktif",
    }).catch((caught: unknown) => caught)) as ApiError
    expect(error.status).toBe(422)
    expect(error.fieldErrors?.name?.[0]).toContain(first!.code)

    const updated = await updateShowcaseRecord(second!.id, {
      name: "Yeni Ad",
      score: 99,
      status: "pasif",
    })
    expect(updated).toMatchObject({
      name: "Yeni Ad",
      score: 99,
      status: "pasif",
    })
  })

  it("güncelleme: şema dışı gövde 422 + alan hataları", async () => {
    const [first] = db.showcaseRecords.findMany()
    const error = (await http
      .patch(`/showcase/records/${first!.id}`, showcaseListParamsSchema, {
        body: { name: "ab", score: 150, status: "aktif" },
      })
      .catch((caught: unknown) => caught)) as ApiError
    expect(error.fieldErrors).toEqual({
      name: ["Ad en az 3 karakter olmalı"],
      score: ["Puan 100'den büyük olamaz"],
    })
  })

  it("silme ve bulunamadı", async () => {
    const [first] = db.showcaseRecords.findMany()
    await deleteShowcaseRecord(first!.id)
    expect(db.showcaseRecords.findById(first!.id)).toBeUndefined()
    await expect(
      deleteShowcaseRecord("yok" as ShowcaseRecordId)
    ).rejects.toMatchObject({ status: 404 })
  })
})
