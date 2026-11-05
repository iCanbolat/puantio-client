import { delay, http as mswHttp, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { apiPath, fileResponse, ok, problem } from "@/mocks/http"
import { server } from "@/mocks/server"
import { getServerTimeOffset } from "@/shared/lib/server-time"

import {
  ApiError,
  ContractError,
  NetworkError,
  getErrorMessage,
} from "./errors"
import { buildUrl, configureHttp, http } from "./http"

const itemSchema = z.object({ id: z.string(), score: z.number() })

describe("http istemcisi", () => {
  it("TC-0.3-01 geçerli yanıtı şemayla doğrulayıp tipli döndürür", async () => {
    server.use(
      mswHttp.get(apiPath("/items/1"), () =>
        ok({ id: "1", score: 90, extra: "yok sayılır" })
      )
    )
    await expect(http.get("/items/1", itemSchema)).resolves.toEqual({
      id: "1",
      score: 90,
    })
  })

  it("TC-0.3-02 şemaya uymayan yanıtta ContractError fırlatır", async () => {
    server.use(
      mswHttp.get(apiPath("/items/1"), () => ok({ id: 1, score: "yüksek" }))
    )
    const error = await http
      .get("/items/1", itemSchema)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ContractError)
    expect((error as ContractError).endpoint).toBe("GET /items/1")
    expect((error as ContractError).issues).toHaveLength(2)
    expect(getErrorMessage(error)).toMatch(/beklenmeyen bir yanıt/)
  })

  it("TC-0.3-03a 401'de token yenilenir ve istek bir kez tekrarlanır", async () => {
    let token = "eski"
    server.use(
      mswHttp.get(apiPath("/secure"), ({ request }) =>
        request.headers.get("Authorization") === "Bearer yeni"
          ? ok({ id: "1", score: 1 })
          : problem(401, "UNAUTHENTICATED", "Oturum doldu")
      )
    )
    const refresh = vi.fn(() => {
      token = "yeni"
      return Promise.resolve(true)
    })
    const onUnauthorized = vi.fn()
    configureHttp({
      getAccessToken: () => token,
      refreshAccessToken: refresh,
      onUnauthorized,
    })

    await expect(http.get("/secure", itemSchema)).resolves.toEqual({
      id: "1",
      score: 1,
    })
    expect(refresh).toHaveBeenCalledOnce()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it("TC-0.3-03b yenileme başarısızsa onUnauthorized çağrılır ve 401 fırlar", async () => {
    server.use(
      mswHttp.get(apiPath("/secure"), () =>
        problem(401, "UNAUTHENTICATED", "Oturum doldu")
      )
    )
    const onUnauthorized = vi.fn()
    configureHttp({
      refreshAccessToken: () => Promise.resolve(false),
      onUnauthorized,
    })

    const error = await http
      .get("/secure", itemSchema)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it("TC-0.3-03c eşzamanlı 401'ler tek bir yenileme isteğini paylaşır", async () => {
    let token = "eski"
    server.use(
      mswHttp.get(apiPath("/secure/:id"), ({ request, params }) =>
        request.headers.get("Authorization") === "Bearer yeni"
          ? ok({ id: String(params.id), score: 1 })
          : problem(401, "UNAUTHENTICATED", "Oturum doldu")
      )
    )
    const refresh = vi.fn(async () => {
      await delay(20)
      token = "yeni"
      return true
    })
    configureHttp({ getAccessToken: () => token, refreshAccessToken: refresh })

    const results = await Promise.all(
      ["1", "2", "3"].map((id) => http.get(`/secure/${id}`, itemSchema))
    )
    expect(results.map((item) => item.id)).toEqual(["1", "2", "3"])
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("TC-0.3-04a 422 alan hataları ApiError üzerinde taşınır", async () => {
    server.use(
      mswHttp.post(apiPath("/items"), () =>
        problem(422, "VALIDATION_FAILED", "Formda hatalı alanlar var.", {
          name: ["Bu ad kullanılıyor"],
        })
      )
    )
    const error = (await http
      .post("/items", itemSchema, { body: { name: "x" } })
      .catch((caught: unknown) => caught)) as ApiError
    expect(error.status).toBe(422)
    expect(error.code).toBe("VALIDATION_FAILED")
    expect(error.fieldErrors).toEqual({ name: ["Bu ad kullanılıyor"] })
  })

  it("JSON olmayan hata gövdesinde varsayılan Türkçe mesaj kullanılır", async () => {
    server.use(
      mswHttp.get(
        apiPath("/items/1"),
        () => new HttpResponse("Bad Gateway", { status: 502 })
      )
    )
    const error = (await http
      .get("/items/1", itemSchema)
      .catch((caught: unknown) => caught)) as ApiError
    expect(error.status).toBe(502)
    expect(error.code).toBe("HTTP_502")
    expect(getErrorMessage(error)).toBe(
      "Sunucuda bir hata oluştu. Lütfen tekrar deneyin."
    )
  })

  it("bağlantı hatası NetworkError(offline) olur", async () => {
    server.use(mswHttp.get(apiPath("/items/1"), () => HttpResponse.error()))
    const error = await http
      .get("/items/1", itemSchema)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).reason).toBe("offline")
    expect(getErrorMessage(error)).toMatch(/İnternet bağlantınızı/)
  })

  it("zaman aşımı NetworkError(timeout) olur", async () => {
    server.use(
      mswHttp.get(apiPath("/items/1"), async () => {
        await delay("infinite")
        return ok({})
      })
    )
    const error = await http
      .get("/items/1", itemSchema, { timeoutMs: 50 })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).reason).toBe("timeout")
  })

  it("kullanıcı iptali olduğu gibi fırlatılır (Query iptali)", async () => {
    server.use(
      mswHttp.get(apiPath("/items/1"), async () => {
        await delay("infinite")
        return ok({})
      })
    )
    const controller = new AbortController()
    const pending = http.get("/items/1", itemSchema, {
      signal: controller.signal,
    })
    controller.abort()
    const error = await pending.catch((caught: unknown) => caught)
    expect(error).not.toBeInstanceOf(NetworkError)
    expect((error as Error).name).toBe("AbortError")
  })

  it("yanıttaki x-server-time başlığı sunucu saatini senkronlar", async () => {
    server.use(
      mswHttp.get(apiPath("/items/1"), () =>
        HttpResponse.json(
          { id: "1", score: 1 },
          {
            headers: {
              "x-server-time": new Date(Date.now() + 3_600_000).toISOString(),
            },
          }
        )
      )
    )
    await http.get("/items/1", itemSchema)
    expect(Math.abs(getServerTimeOffset() - 3_600_000)).toBeLessThan(1000)
  })

  it("gövde ve 204 yanıtları", async () => {
    let received: unknown
    server.use(
      mswHttp.put(apiPath("/items/1"), async ({ request }) => {
        received = await request.json()
        return new HttpResponse(null, { status: 204 })
      })
    )
    await expect(
      http.put("/items/1", z.undefined(), { body: { score: 5 } })
    ).resolves.toBeUndefined()
    expect(received).toEqual({ score: 5 })
  })

  it("dosya indirme: blob + Türkçe dosya adı", async () => {
    server.use(
      mswHttp.get(apiPath("/export"), () =>
        fileResponse("a;b", "puantaj-eylül.csv", "text/csv")
      )
    )
    const { blob, filename } = await http.getBlob("/export")
    expect(filename).toBe("puantaj-eylül.csv")
    expect(await blob.text()).toBe("a;b")
  })

  it("URL üretimi: boş parametreler atlanır, diziler tekrarlanır", () => {
    expect(
      buildUrl("/items", {
        page: 2,
        q: "",
        city: undefined,
        category: ["banka", "ofis"],
        aktif: true,
      })
    ).toBe(
      "http://localhost/api/items?page=2&category=banka&category=ofis&aktif=true"
    )
    expect(buildUrl("items")).toBe("http://localhost/api/items")
  })
})
