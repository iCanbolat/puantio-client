import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"

describe("uygulama kabuğu", () => {
  it("TC-0.2-01 panel: menü, breadcrumb, sistem durumu", async () => {
    renderApp()
    expect(
      await screen.findByRole("heading", { name: "Operasyon paneli" })
    ).toBeInTheDocument()

    const nav = screen.getByRole("navigation", { name: "Sayfa konumu" })
    expect(within(nav).getByText("Ana sayfa")).toBeInTheDocument()
    expect(await screen.findByText("Mock")).toBeInTheDocument()
  })

  it("TC-0.2-02 henüz geliştirilmemiş modüller faz rozetiyle pasif görünür", async () => {
    renderApp()
    await screen.findByRole("heading", { name: "Operasyon paneli" })
    const contracts = screen.getByText("Sözleşmeler").closest("button")
    expect(contracts).toHaveAttribute("aria-disabled", "true")
    expect(within(contracts!).getByText("Faz 3")).toBeInTheDocument()
    // Faz 2 modülleri artık bağlantı
    expect(
      screen.getByRole("link", { name: /Vardiya planlama/ })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Personel/ })).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Bileşen vitrini/ })
    ).toBeInTheDocument()
  })

  it("TC-0.2-03 canlı kanal bağlanır ve üst çubukta gösterilir", async () => {
    renderApp()
    expect(await screen.findByText("Canlı")).toBeInTheDocument()
  })

  it("TC-0.2-04 sunucu saati mock saatini izler", async () => {
    mockClock.freeze("2026-09-29T07:10:00+03:00")
    renderApp()
    await waitFor(() => {
      expect(screen.getByTestId("server-clock")).toHaveTextContent("07:10")
    })
  })

  it("TC-0.2-05 bilinmeyen adres menü içinde 404 gösterir", async () => {
    renderApp({ route: "/olmayan/sayfa" })
    expect(await screen.findByText("Sayfa bulunamadı")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ana sayfaya dön" })
    ).toHaveAttribute("href", "/")
    expect(screen.getByText("Saha operasyonu")).toBeInTheDocument()
  })

  it("TC-0.2-06 yetkisiz sayfası", async () => {
    renderApp({ route: "/yetkisiz" })
    expect(
      await screen.findByText("Bu sayfaya erişim yetkiniz yok")
    ).toBeInTheDocument()
  })

  it("TC-0.2-07 mock modu kapalıyken geliştirici menüsü ve vitrin yoktur", async () => {
    renderApp({ route: "/gelistirici/bilesenler", showDevTools: false })
    expect(await screen.findByText("Sayfa bulunamadı")).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /Bileşen vitrini/ })
    ).not.toBeInTheDocument()
  })

  it("TC-0.2-08 müşteri portalı ve public QR kabukları", async () => {
    const portal = renderApp({ route: "/portal" })
    expect(
      await screen.findByText("Puantio Müşteri Portalı")
    ).toBeInTheDocument()
    expect(screen.queryByText("Saha operasyonu")).not.toBeInTheDocument()
    portal.unmount()

    renderApp({ route: "/q/ALAN-42" })
    expect(await screen.findByText(/Alan kodu: ALAN-42/)).toBeInTheDocument()
  })

  it("TC-0.2-09 ana sayfa erişilebilirlik denetiminden geçer", async () => {
    const { container } = renderApp()
    await screen.findByText("Canlı")
    await expectNoA11yViolations(container)
  })
})
