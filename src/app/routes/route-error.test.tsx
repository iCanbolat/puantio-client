import { render, screen } from "@testing-library/react"
import { createMemoryRouter, data } from "react-router"
import { RouterProvider } from "react-router/dom"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ApiError, ContractError } from "@/shared/api/errors"

import { paths, routePatterns } from "../router/paths"
import { RouteError } from "./route-error"

function renderWithLoaderError(error: unknown) {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  const router = createMemoryRouter(
    [
      {
        path: "/",
        errorElement: <RouteError />,
        loader: () => {
          throw error
        },
        Component: () => null,
      },
    ],
    { initialEntries: ["/"] }
  )
  render(<RouterProvider router={router} />)
}

describe("RouteError", () => {
  it("TC-0.2-10 kontrat hatası kullanıcı dostu mesaj + geliştirici detayı gösterir", async () => {
    const zodError = z.object({ a: z.string() }).safeParse({}).error!
    renderWithLoaderError(new ContractError("GET /personel", zodError))
    expect(
      await screen.findByText("Beklenmeyen sunucu yanıtı")
    ).toBeInTheDocument()
    expect(screen.getByText(/Teknik ekip bilgilendirildi/)).toBeInTheDocument()
    expect(
      screen.getByText(/API kontrat hatası \(GET \/personel\)/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Sayfayı yenile" })
    ).toBeInTheDocument()
  })

  it("403 yetkisiz sayfasına, 404 bulunamadı sayfasına döner", async () => {
    renderWithLoaderError(
      new ApiError(403, { code: "FORBIDDEN", message: "Yetki yok" })
    )
    expect(
      await screen.findByText("Bu sayfaya erişim yetkiniz yok")
    ).toBeInTheDocument()
  })

  it("route 404 yanıtı", async () => {
    renderWithLoaderError(data(null, { status: 404 }))
    expect(await screen.findByText("Sayfa bulunamadı")).toBeInTheDocument()
  })

  it("API 404 ve genel hata", async () => {
    renderWithLoaderError(
      new ApiError(404, { code: "NOT_FOUND", message: "Yok" })
    )
    expect(await screen.findByText("Sayfa bulunamadı")).toBeInTheDocument()
  })

  it("beklenmeyen hata genel mesaj gösterir", async () => {
    renderWithLoaderError(new Error("boom"))
    expect(await screen.findByText("Bir şeyler ters gitti")).toBeInTheDocument()
    expect(screen.getByText("Beklenmeyen bir hata oluştu.")).toBeInTheDocument()
  })
})

describe("tipli yollar", () => {
  it("path üreticileri route desenleriyle tutarlı", () => {
    expect(paths.home()).toBe("/")
    expect(paths.forbidden()).toBe(routePatterns.forbidden)
    expect(paths.devShowcase()).toBe("/gelistirici/bilesenler")
    expect(paths.portal.home()).toBe("/portal")
    expect(paths.publicFeedback("KAT 3/WC")).toBe("/q/KAT%203%2FWC")
  })
})
