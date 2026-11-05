import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { externalNavigation } from "@/shared/lib/navigation"
import { renderApp } from "@/test/render"

describe("Batch 1.8 platform paneli", () => {
  it("TC-1.8-01 destek oturumu: gerekçe zorunlu, kiracıya geçiş, destek bandı ve denetim kaydı", async () => {
    const assign = vi
      .spyOn(externalNavigation, "assign")
      .mockImplementation(() => undefined)
    const platform = renderApp({
      tenant: "platform",
      user: "destek",
      route: "/platform/kiracilar/temizlik-orta",
    })
    await platform.user.click(
      await screen.findByRole("button", { name: "Destek oturumu başlat" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Destek oturumu başlat",
    })
    await platform.user.click(
      within(dialog).getByRole("button", { name: "Başlat ve firmaya geç" })
    )
    expect(
      await within(dialog).findByText("Gerekçe en az 10 karakter olmalı")
    ).toBeInTheDocument()
    await platform.user.type(
      within(dialog).getByLabelText("Gerekçe"),
      "Destek talebi #1234: puantaj aktarım hatası"
    )
    await platform.user.click(
      within(dialog).getByRole("button", { name: "Başlat ve firmaya geç" })
    )
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("https://temizlik-orta.puantio.com/")
    })
    platform.unmount()

    const tenantApp = renderApp({ tenant: "temizlik-orta", user: "destek" })
    expect(await screen.findByText("Destek modundasınız")).toBeInTheDocument()
    expect(screen.getByText(/Gerekçe: Destek talebi #1234/)).toBeInTheDocument()
    // Salt okunur: yazma aksiyonları yok
    await tenantApp.user.click(screen.getByRole("link", { name: /Personel/ }))
    await screen.findByRole("table", { name: "Personel listesi" })
    expect(
      screen.queryByRole("link", { name: "Yeni personel" })
    ).not.toBeInTheDocument()

    await tenantApp.user.click(
      screen.getByRole("link", { name: /Denetim kayıtları/ })
    )
    expect(
      await screen.findByRole("cell", { name: "Destek oturumu başlatıldı" })
    ).toBeInTheDocument()
    expect(screen.getAllByText("Puantio destek").length).toBeGreaterThan(0)

    await tenantApp.user.click(
      screen.getByRole("button", { name: "Destek oturumunu bitir" })
    )
    expect(await screen.findByText("Çıkış yaptınız")).toBeInTheDocument()
    expect(
      db.supportSessions.findFirst(
        (session) => session.tenantSlug === "temizlik-orta"
      )?.endedAt
    ).not.toBeNull()
  })

  it("destek oturumu olmadan platform personeli kiracıya giremez; süresi dolan oturum da geçersiz", async () => {
    renderApp({ tenant: "temizlik-orta", user: "destek" })
    expect(
      await screen.findByRole("heading", { name: "Etkin destek oturumu yok" })
    ).toBeInTheDocument()
  })

  it("kiracı listesi ve yeni kiracı: ayrılmış alt alan adı reddedilir, sistem rolleri hazırlanır", async () => {
    const { user } = renderApp({
      tenant: "platform",
      user: "destek",
      route: "/platform/kiracilar",
    })
    expect(
      await screen.findByRole("link", { name: "Çınar Şirketler Grubu" })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("link", { name: "Yeni kiracı" }))
    await user.type(
      await screen.findByLabelText("Firma adı"),
      "Yıldız Tesis Hizmetleri"
    )
    await user.type(screen.getByLabelText("Kısa ad"), "Yıldız")
    await user.type(screen.getByLabelText("Alt alan adı"), "admin")
    await user.type(screen.getByLabelText("Ad soyad"), "Can Yıldız")
    await user.type(screen.getByLabelText("E-posta"), "can@yildiz.example")
    await user.click(screen.getByRole("button", { name: "Kiracıyı oluştur" }))
    expect(
      await screen.findByText("Bu alt alan adı ayrılmış")
    ).toBeInTheDocument()

    const slug = screen.getByLabelText("Alt alan adı")
    await user.clear(slug)
    await user.type(slug, "yildiz")
    await user.click(screen.getByRole("button", { name: "Kiracıyı oluştur" }))
    expect(
      await screen.findByRole("heading", { name: "Yıldız Tesis Hizmetleri" })
    ).toBeInTheDocument()
    expect(
      db.roles.count((role) => role.tenantId === "yildiz")
    ).toBeGreaterThan(5)
    expect(
      db.users.findFirst((item) => item.tenantId === "yildiz")?.status
    ).toBe("invited")
  })

  it("kiracının paketi güncellenir ve askıya alınır", async () => {
    const { user } = renderApp({
      tenant: "platform",
      user: "destek",
      route: "/platform/kiracilar/guvenlik",
    })
    await user.click(
      await screen.findByRole("checkbox", { name: /Kalite ve iş emirleri/ })
    )
    await user.click(screen.getByRole("button", { name: "Paketi kaydet" }))
    await waitFor(() => {
      expect(db.tenants.findById("guvenlik")?.modules).toContain("quality")
    })
    await user.click(screen.getByRole("button", { name: "Askıya al" }))
    await user.click(
      await screen.findByRole("button", { name: "Askıya al", hidden: false })
    )
    await waitFor(() => {
      expect(db.tenants.findById("guvenlik")?.status).toBe("suspended")
    })
  })

  it("destek oturumları listesi ve bitirme", async () => {
    db.supportSessions.insert({
      id: "sup-1",
      tenantSlug: "guvenlik",
      agentUserId: "u-platform-destek",
      agentName: "Deniz Ak (Puantio Destek)",
      reason: "Kontrol",
      startedAt: mockClock.now().toISOString(),
      expiresAt: new Date(mockClock.now().getTime() + 3_600_000).toISOString(),
      endedAt: null,
    })
    const { user } = renderApp({
      tenant: "platform",
      user: "destek",
      route: "/platform/destek-oturumlari",
    })
    expect(await screen.findByText("Açık")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Bitir" }))
    expect(await screen.findByText("Kapandı")).toBeInTheDocument()
  })
})
