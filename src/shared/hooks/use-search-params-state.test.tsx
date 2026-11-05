import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { listParamsSchema } from "@/shared/types"

import {
  parseSearchParams,
  useSearchParamsState,
  writeSearchParams,
} from "./use-search-params-state"

const schema = listParamsSchema.extend({
  status: z.enum(["aktif", "pasif"]).optional().catch(undefined),
  category: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .optional()
    .catch(undefined),
})

function setup(initialUrl: string) {
  let router: ReturnType<typeof createMemoryRouter> | null = null
  const wrapper = ({ children }: { children: ReactNode }) => {
    router ??= createMemoryRouter([{ path: "*", element: children }], {
      initialEntries: [initialUrl],
    })
    return <RouterProvider router={router} />
  }
  const hook = renderHook(() => useSearchParamsState(schema), { wrapper })
  return { ...hook, search: () => router!.state.location.search }
}

describe("useSearchParamsState", () => {
  it("TC-0.6-05 URL'yi şemayla ayrıştırır, geçersiz değerler varsayılana düşer", () => {
    const { result } = setup(
      "/?page=abc&pageSize=999&status=silindi&sort=name&category=banka"
    )
    const [state] = result.current
    expect(state).toEqual({
      page: 1,
      pageSize: 20,
      sort: "name",
      status: undefined,
      category: ["banka"],
      order: undefined,
      q: undefined,
    })
  })

  it("güncelleme varsayılanları URL'den çıkarır, şema dışı parametrelere dokunmaz", () => {
    const { result, search } = setup("/?bolum=harita&page=3")
    act(() => {
      result.current[1]({
        page: 1,
        status: "aktif",
        category: ["banka", "ofis"],
      })
    })
    expect(search()).toBe(
      "?bolum=harita&status=aktif&category=banka&category=ofis"
    )
    expect(result.current[0].category).toEqual(["banka", "ofis"])

    act(() => {
      result.current[1]((previous) => ({ page: previous.page + 1 }))
    })
    expect(search()).toContain("page=2")

    act(() => {
      result.current[2]()
    })
    expect(search()).toBe("?bolum=harita")
  })

  it("saf yardımcılar", () => {
    expect(parseSearchParams(schema, new URLSearchParams("")).page).toBe(1)
    const written = writeSearchParams(schema, new URLSearchParams("x=1"), {
      page: 1,
      pageSize: 50,
      q: "",
      category: [],
    })
    expect(written.toString()).toBe("x=1&pageSize=50")
  })
})
