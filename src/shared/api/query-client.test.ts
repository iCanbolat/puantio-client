import { QueryObserver } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ApiError, ContractError, NetworkError } from "./errors"
import { createQueryClient, shouldRetry } from "./query-client"

const apiError = (status: number) =>
  new ApiError(status, { code: "X", message: "x" })

describe("QueryClient politikaları", () => {
  it("TC-0.3-15 yeniden deneme matrisi", () => {
    expect(shouldRetry(0, apiError(500))).toBe(true)
    expect(shouldRetry(1, apiError(503))).toBe(true)
    expect(shouldRetry(2, apiError(503))).toBe(false)
    expect(shouldRetry(0, apiError(404))).toBe(false)
    expect(shouldRetry(0, apiError(422))).toBe(false)
    expect(shouldRetry(0, apiError(429))).toBe(true)
    expect(shouldRetry(0, new NetworkError("offline"))).toBe(true)
    const contract = new ContractError(
      "GET /x",
      z.object({ a: z.string() }).safeParse({}).error!
    )
    expect(shouldRetry(0, contract)).toBe(false)
  })

  it("ilk yükleme hatasında toast gösterilmez, arka plan yenilemede gösterilir", async () => {
    const notifier = { error: vi.fn(), success: vi.fn() }
    const client = createQueryClient(notifier)
    client.setDefaultOptions({ queries: { retry: false } })

    await client
      .query({ queryKey: ["a"], queryFn: () => Promise.reject(apiError(500)) })
      .catch(() => null)
    expect(notifier.error).not.toHaveBeenCalled()

    client.setQueryData(["b"], { ok: true })
    const observer = new QueryObserver(client, {
      queryKey: ["b"],
      queryFn: () => Promise.reject(apiError(500)),
    })
    await observer.refetch()
    expect(notifier.error).toHaveBeenCalledWith(
      "Sunucuda bir hata oluştu. Lütfen tekrar deneyin."
    )
  })

  it("mutation meta: başarı mesajı, geçersiz kılma ve 422'de sessizlik", async () => {
    const notifier = { error: vi.fn(), success: vi.fn() }
    const client = createQueryClient(notifier)
    client.setQueryData(["liste"], [1])

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.resolve("tamam"),
        meta: { successMessage: "Kaydedildi", invalidates: [["liste"]] },
      })
      .execute(undefined)
    expect(notifier.success).toHaveBeenCalledWith("Kaydedildi")
    expect(client.getQueryState(["liste"])?.isInvalidated).toBe(true)

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () =>
          Promise.reject(
            new ApiError(422, {
              code: "V",
              message: "x",
              fieldErrors: { a: ["b"] },
            })
          ),
      })
      .execute(undefined)
      .catch(() => null)
    expect(notifier.error).not.toHaveBeenCalled()

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.reject(apiError(409)),
        meta: { errorMessage: "Vardiya kaydedilemedi" },
      })
      .execute(undefined)
      .catch(() => null)
    expect(notifier.error).toHaveBeenCalledWith("Vardiya kaydedilemedi")
  })
})
