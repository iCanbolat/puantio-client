import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ApiError, ContractError } from "@/shared/api/errors"
import { http } from "@/shared/api/http"
import { listParamsSchema } from "@/shared/types"
import { showcaseListSchema } from "@/features/dev-showcase/model/showcase-record"
import { applyTestScenario } from "@/test/scenario"

import { resetChaos, setChaos } from "./chaos"
import { mockClock } from "./clock"
import { Collection, db, resetDatabase, snapshotDatabase } from "./db"
import { scenarios } from "./scenarios"

const timeSchema = z.object({ serverTime: z.string() })
const listParams = (overrides: Record<string, unknown> = {}) =>
  listParamsSchema.parse({ page: 1, pageSize: 20, ...overrides })

describe("mock veritabanı", () => {
  it("TC-0.4-01 aynı seed birebir aynı veriyi üretir", () => {
    resetDatabase("test", 42)
    const first = snapshotDatabase()
    resetDatabase("test", 42)
    expect(snapshotDatabase()).toEqual(first)
    resetDatabase("test", 7)
    expect(snapshotDatabase()).not.toEqual(first)
  })

  it("seed profilleri kayıt sayısını belirler", () => {
    resetDatabase("test")
    expect(db.showcaseRecords.count()).toBe(45)
    resetDatabase("dev")
    expect(db.showcaseRecords.count()).toBe(240)
  })

  it("üretilen kayıtlar API şemasına uyar", () => {
    const page = db.showcaseRecords.query(listParams({ pageSize: 50 }))
    expect(showcaseListSchema.safeParse(page).success).toBe(true)
  })

  it("koleksiyon: Türkçe arama, sıralama, sayfalama", () => {
    const people = new Collection<{ id: string; name: string; age: number }>(
      "kisiler"
    )
    people.insertMany([
      { id: "1", name: "Şule", age: 30 },
      { id: "2", name: "Çağrı", age: 25 },
      { id: "3", name: "İpek", age: 41 },
      { id: "4", name: "Ilgaz", age: 35 },
    ])
    const options = {
      searchFields: ["name"] as const,
      sortableFields: ["name", "age"] as const,
    }

    expect(
      people.query(listParams({ q: "sule" }), options).items.map((p) => p.name)
    ).toEqual(["Şule"])
    expect(
      people
        .query(listParams({ sort: "name" }), options)
        .items.map((p) => p.name)
    ).toEqual(["Çağrı", "Ilgaz", "İpek", "Şule"])
    expect(
      people
        .query(listParams({ sort: "age", order: "desc" }), options)
        .items.map((p) => p.age)
    ).toEqual([41, 35, 30, 25])
    // izin verilmeyen sıralama alanı yok sayılır
    expect(
      people.query(listParams({ sort: "id" }), options).items
    ).toHaveLength(4)

    const paged = people.query(listParams({ pageSize: 10, page: 2 }), options)
    expect(paged.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 4,
      pageCount: 1,
    })
    expect(paged.items).toEqual([])

    expect(() => people.insert({ id: "1", name: "Tekrar", age: 1 })).toThrow(
      /zaten var/
    )
    expect(people.update("2", { age: 26 })?.age).toBe(26)
    expect(people.update("yok", { age: 1 })).toBeUndefined()
    expect(people.remove("2")).toBe(true)
    expect(people.count((p) => p.age > 30)).toBe(2)
  })

  it("koleksiyon kopyalar döner (dışarıdan mutasyon DB'yi bozmaz)", () => {
    const first = db.showcaseRecords.findMany()[0]!
    first.name = "Değişti"
    expect(db.showcaseRecords.findById(first.id)?.name).not.toBe("Değişti")
  })
})

describe("mock saat", () => {
  it("TC-0.4-02 sabitlenen saat handler'lara ve x-server-time başlığına yansır", async () => {
    mockClock.freeze("2026-09-29T07:14:00+03:00")
    const response = await http.get("/system/time", timeSchema)
    expect(response.serverTime).toBe("2026-09-29T04:14:00.000Z")
  })

  it("ileri sarma ve gerçek saate dönüş", () => {
    mockClock.freeze("2026-09-29T07:00:00+03:00")
    mockClock.advance(15 * 60_000)
    expect(mockClock.now().toISOString()).toBe("2026-09-29T04:15:00.000Z")

    mockClock.reset()
    expect(mockClock.isReal()).toBe(true)
    mockClock.advance(60_000)
    expect(mockClock.getOffsetMs()).toBe(60_000)

    mockClock.travelTo(new Date(Date.now() + 3_600_000))
    expect(Math.abs((mockClock.getOffsetMs() ?? 0) - 3_600_000)).toBeLessThan(
      50
    )
    mockClock.advance(60_000)
    expect(Math.abs((mockClock.getOffsetMs() ?? 0) - 3_660_000)).toBeLessThan(
      50
    )

    mockClock.freeze("2026-09-29T07:00:00+03:00")
    expect(mockClock.getOffsetMs()).toBeNull()
  })

  it("saat değişikliği dinleyicileri bilgilendirir", () => {
    const listener = vi.fn()
    const unsubscribe = mockClock.subscribe(listener)
    mockClock.advance(1000)
    mockClock.reset()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    mockClock.advance(1000)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe("ağ kaosu", () => {
  it("TC-0.4-03 belirli endpoint'e hata enjekte edilir", async () => {
    setChaos({
      faults: [
        {
          id: "f1",
          method: "GET",
          pathContains: "/showcase/records",
          status: 409,
        },
      ],
    })
    const error = (await http
      .get("/showcase/records", showcaseListSchema)
      .catch((caught: unknown) => caught)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    expect(error.code).toBe("CHAOS_FAULT")
    // başka metot etkilenmez
    await expect(
      http.get("/showcase/cities", z.object({ items: z.array(z.unknown()) }))
    ).resolves.toBeDefined()
  })

  it("hata oranı %100 iken 503, sistem uçları muaf", async () => {
    setChaos({ errorRate: 1 })
    await expect(
      http.get("/showcase/records", showcaseListSchema)
    ).rejects.toMatchObject({ status: 503 })
    await expect(http.get("/system/time", timeSchema)).resolves.toBeDefined()
    resetChaos()
    await expect(
      http.get("/showcase/records", showcaseListSchema)
    ).resolves.toBeDefined()
  })

  it("gecikme uygulanır", async () => {
    setChaos({ latencyMs: 120 })
    const started = performance.now()
    await http.get("/showcase/records", showcaseListSchema)
    expect(performance.now() - started).toBeGreaterThanOrEqual(100)
  })
})

describe("senaryolar", () => {
  it("TC-0.4-04 tüm senaryolar benzersiz kimlikli ve açıklamalı", () => {
    const ids = scenarios.map((scenario) => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const scenario of scenarios)
      expect(scenario.description.length).toBeGreaterThan(10)
  })

  it("empty: listeler boş döner", async () => {
    applyTestScenario("empty")
    const page = await http.get("/showcase/records", showcaseListSchema)
    expect(page.meta.total).toBe(0)
  })

  it("server-error ve unauthorized: sistem uçları hariç hata", async () => {
    applyTestScenario("server-error")
    await expect(
      http.get("/showcase/records", showcaseListSchema)
    ).rejects.toMatchObject({ status: 500 })
    await expect(http.get("/system/time", timeSchema)).resolves.toBeDefined()

    applyTestScenario("unauthorized")
    await expect(
      http.get("/showcase/records", showcaseListSchema)
    ).rejects.toMatchObject({ status: 401 })
  })

  it("contract-drift: istemci ContractError üretir", async () => {
    applyTestScenario("contract-drift")
    await expect(
      http.get("/showcase/records", showcaseListSchema)
    ).rejects.toBeInstanceOf(ContractError)
  })

  it("bilinmeyen senaryo hata verir", () => {
    expect(() => applyTestScenario("yok-boyle-bir-sey")).toThrow(
      /Bilinmeyen senaryo/
    )
  })
})
