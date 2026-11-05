import { screen, waitFor, within } from "@testing-library/react"
import { http } from "msw"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { apiPath, ok } from "@/mocks/http"
import { server } from "@/mocks/server"
import { storageKey } from "@/shared/config/brand"
import {
  resetUiStore,
  scopeUiStoreToTenant,
  useUiStore,
} from "@/shared/stores/ui-store"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"

describe("Batch 1.0 kiracı yapılandırması", () => {
  it("kiracı markası: yan menüde firma adı, sekme başlığında kısa ad", async () => {
    renderApp()
    const nav = await screen.findByLabelText("Ana menü")
    expect(within(nav).getByText("Lavanta")).toBeInTheDocument()
    expect(
      within(nav).getByText("Puantio Operasyon Platformu")
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(document.title).toBe("Lavanta · Puantio")
    })
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "#5b21b6"
    )
  })

  it("TC-1.0-01 tenant-config şemaya uymuyorsa uygulama anlaşılır hatayla açılmaz", async () => {
    server.use(
      http.get(apiPath("/public/tenant-config"), () => ok({ slug: 42 }))
    )
    renderApp()
    expect(
      await screen.findByText("Beklenmeyen sunucu yanıtı")
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("Ana menü")).not.toBeInTheDocument()
  })

  it("adres bir firmaya ait değilse 'Firma bulunamadı'", async () => {
    renderApp({ tenant: "olmayan-firma" })
    expect(await screen.findByText("Firma bulunamadı")).toBeInTheDocument()
  })

  it("askıya alınmış kiracıda uygulama açılmaz", async () => {
    db.tenants.update("temizlik-orta", { status: "suspended" })
    renderApp()
    expect(
      await screen.findByText("Firma hesabı askıya alındı")
    ).toBeInTheDocument()
  })

  it("TC-1.0-02 modülü kapalı kiracıda /hakedis: menüde yok, URL ile 'Paketinizde yok'", async () => {
    const tenant = db.tenants.findById("temizlik-orta")!
    db.tenants.update(tenant.id, {
      modules: tenant.modules.filter((module) => module !== "contracts"),
    })
    renderApp({ route: "/hakedis" })
    expect(await screen.findByText("Paketinizde yok")).toBeInTheDocument()
    expect(screen.getByText(/"Sözleşme ve hakediş" modülü/)).toBeInTheDocument()
    const nav = screen.getByLabelText("Ana menü")
    expect(within(nav).queryByText("Hakediş")).not.toBeInTheDocument()
    expect(within(nav).queryByText("Sözleşmeler")).not.toBeInTheDocument()
  })

  it("pakette olan ama henüz geliştirilmemiş modül faz bilgisini gösterir", async () => {
    renderApp({ route: "/hakedis" })
    expect(
      await screen.findByText("Bu modül Faz 3'de geliştirilecek.")
    ).toBeInTheDocument()
  })

  it("TC-1.0-03 terminoloji 'Proje': menü, başlık ve breadcrumb 'Proje' der, URL değişmez", async () => {
    const { router, user } = renderApp({ tenant: "cok-hatli-grup" })
    const nav = await screen.findByLabelText("Ana menü")
    await user.click(within(nav).getByRole("link", { name: /Projeler/ }))
    expect(
      await screen.findByRole("heading", { name: "Projeler" })
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/lokasyonlar")
    const crumbs = screen.getByRole("navigation", { name: "Sayfa konumu" })
    expect(within(crumbs).getByText("Projeler")).toBeInTheDocument()
    expect(within(nav).queryByText("Lokasyonlar")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Yeni proje" })).toBeInTheDocument()
  })

  it("TC-1.0-04 kiracı A oturumuyla kiracı B'nin kaydı bulunamaz", async () => {
    renderApp({ route: "/personel/per-guvenlik-1" })
    expect(await screen.findByText("Kayıt bulunamadı.")).toBeInTheDocument()
    expect(screen.queryByText(/per-guvenlik-1/)).not.toBeInTheDocument()
  })

  it("TC-1.0-05 aynı tarayıcıda iki kiracının UI tercihleri karışmaz", () => {
    scopeUiStoreToTenant("temizlik-orta")
    useUiStore.getState().setSidebarOpen(false)
    useUiStore.getState().setHiddenColumns("personel", ["phoneMasked"])
    expect(localStorage.getItem(storageKey("ui", "temizlik-orta"))).toContain(
      '"sidebarOpen":false'
    )

    scopeUiStoreToTenant("guvenlik")
    expect(useUiStore.getState().sidebarOpen).toBe(true)
    expect(useUiStore.getState().hiddenColumns).toEqual({})

    scopeUiStoreToTenant("temizlik-orta")
    expect(useUiStore.getState().sidebarOpen).toBe(false)
    expect(useUiStore.getState().hiddenColumns.personel).toEqual([
      "phoneMasked",
    ])
    resetUiStore()
  })

  it("platform kiracısında panel yerine platform paneli açılır", async () => {
    const { router } = renderApp({ tenant: "platform", user: "destek" })
    expect(
      await screen.findByRole("heading", { name: "Platform genel bakış" })
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/platform")
  })

  it("kiracı adresinde /platform açılmaz", async () => {
    const { router } = renderApp({ route: "/platform" })
    expect(
      await screen.findByRole("heading", { name: "Operasyon paneli" })
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
  })
})

describe("Batch 1.2 RBAC", () => {
  it("TC-1.2-01 süpervizör: Hakediş menüde yok, URL ile 403", async () => {
    renderApp({ user: "supervizor", route: "/hakedis" })
    expect(
      await screen.findByText("Bu sayfaya erişim yetkiniz yok")
    ).toBeInTheDocument()
    expect(
      within(screen.getByLabelText("Ana menü")).queryByText("Hakediş")
    ).not.toBeInTheDocument()
  })

  it("yetkisiz ayar sayfası URL ile açılmaz", async () => {
    renderApp({ user: "supervizor", route: "/ayarlar/kullanicilar" })
    expect(
      await screen.findByText("Bu sayfaya erişim yetkiniz yok")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("table", { name: "Kullanıcılar" })
    ).not.toBeInTheDocument()
  })

  it("panel kabuğu (kiracı markası ve menü) erişilebilirlik denetiminden geçer", async () => {
    const { container } = renderApp({ tenant: "cok-hatli-grup" })
    await screen.findByRole("heading", { name: "Operasyon paneli" })
    await screen.findByText("Canlı")
    await expectNoA11yViolations(container)
  })
})
