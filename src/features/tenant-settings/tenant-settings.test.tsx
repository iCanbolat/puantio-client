import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { renderApp } from "@/test/render"

describe("firma ayarları ve denetim kayıtları", () => {
  it("kavram adı değiştirilince menü anında güncellenir; işlem denetim kaydına düşer", async () => {
    const { user } = renderApp({ route: "/ayarlar/firma" })
    const singular = await screen.findByLabelText("Lokasyon kavramı (tekil)")
    await user.clear(singular)
    await user.type(singular, "Şube")
    const plural = screen.getByLabelText("Çoğul", {
      selector: "#term-location-plural",
    })
    await user.clear(plural)
    await user.type(plural, "Şubeler")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    const nav = screen.getByLabelText("Ana menü")
    expect(
      await within(nav).findByRole("link", { name: /Şubeler/ })
    ).toBeInTheDocument()
    expect(db.tenants.findById("temizlik-orta")?.terminology.location).toEqual({
      singular: "Şube",
      plural: "Şubeler",
    })

    await user.click(
      within(nav).getByRole("link", { name: /Denetim kayıtları/ })
    )
    expect(
      await screen.findByRole("cell", { name: "Firma ayarları güncellendi" })
    ).toBeInTheDocument()
  })

  it("marka rengi kontrast uyarısı ve geçersiz kurallar", async () => {
    const { user } = renderApp({ route: "/ayarlar/firma" })
    const color = await screen.findByLabelText("Marka rengi")
    await user.clear(color)
    await user.type(color, "#fde047")
    expect(
      await screen.findByText(
        "Kontrast yetersiz: varsayılan tema rengi kullanılacak"
      )
    ).toBeInTheDocument()
    await user.clear(color)
    await user.type(color, "#1e3a8a")
    expect(
      await screen.findByText("Beyaz metinle yeterli kontrast (WCAG AA)")
    ).toBeInTheDocument()

    const idle = screen.getByLabelText("Oturum zaman aşımı (dk)")
    await user.clear(idle)
    await user.type(idle, "1")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    await waitFor(() => {
      expect(idle).toHaveAttribute("aria-invalid", "true")
    })
  })
})
