import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { renderApp } from "@/test/render"

describe("Batch 1.3 organizasyon ve tüzel kişilik", () => {
  it("tüzel kişilik eklenir; geçersiz VKN, mükerrer VKN ve SGK numarası doğrulanır", async () => {
    const existing = db.legalEntities.findFirst(
      (entity) => entity.tenantId === "cok-hatli-grup"
    )!
    const { user } = renderApp({
      tenant: "cok-hatli-grup",
      route: "/ayarlar/tuzel-kisilikler",
    })
    expect(
      await screen.findByRole("cell", {
        name: /Çınar Peyzaj ve Bahçe Ltd. Şti./,
      })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Yeni tüzel kişilik" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Yeni tüzel kişilik",
    })
    await user.type(
      within(dialog).getByLabelText("Unvan"),
      "Çınar Güvenlik A.Ş."
    )
    await user.type(
      within(dialog).getByLabelText("Vergi kimlik no"),
      "1234567891"
    )
    await user.type(within(dialog).getByLabelText("Vergi dairesi"), "Kozyatağı")
    await user.type(
      within(dialog).getByLabelText("SGK işyeri sicil numaraları"),
      "123"
    )
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await within(dialog).findByText("Geçersiz vergi kimlik numarası")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText("SGK işyeri sicil numarası 26 haneli olmalı")
    ).toBeInTheDocument()

    const vkn = within(dialog).getByLabelText("Vergi kimlik no")
    await user.clear(vkn)
    await user.type(vkn, existing.taxNumber)
    const sgk = within(dialog).getByLabelText("SGK işyeri sicil numaraları")
    await user.clear(sgk)
    await user.type(sgk, "1".repeat(26))
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await within(dialog).findByText("Bu VKN ile bir tüzel kişilik zaten var.")
    ).toBeInTheDocument()

    await user.clear(vkn)
    await user.type(vkn, "1234567890")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByRole("cell", { name: /Çınar Güvenlik A.Ş./ })
    ).toBeInTheDocument()
  })

  it("iki seviyeli hiyerarşi kiracı terminolojisiyle gösterilir; alt birim eklenir", async () => {
    const { user } = renderApp({
      tenant: "cok-hatli-grup",
      route: "/ayarlar/bolgeler",
    })
    expect(
      await screen.findByRole("heading", { name: "Bölgeler ve Alt bölgeler" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Bölge → Alt bölge → Proje → Alan/)
    ).toBeInTheDocument()
    const marmara = await screen.findByRole("list", {
      name: "Marmara alt birimleri",
    })
    expect(within(marmara).getByText("İstanbul Avrupa")).toBeInTheDocument()

    const marmaraItem = marmara.closest("li") as HTMLElement
    await user.click(
      within(marmaraItem).getAllByRole("button", { name: "Alt bölge ekle" })[0]!
    )
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText(/Yeni alt bölge · Marmara/)
    ).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Kod"), "ist-kuzey")
    await user.type(within(dialog).getByLabelText("Ad"), "İstanbul Kuzey")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await within(marmara).findByText("İstanbul Kuzey")
    ).toBeInTheDocument()
    expect(
      db.orgUnits.findFirst((unit) => unit.code === "IST-KUZEY")?.parentId
    ).toBe("ou-cok-hatli-grup-MAR")
  })

  it("lokasyonu olan birim silinemez (409)", async () => {
    const { user } = renderApp({ route: "/ayarlar/bolgeler" })
    await user.click(await screen.findByRole("button", { name: "Marmara sil" }))
    await user.click(await screen.findByRole("button", { name: "Sil" }))
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    })
    expect(db.orgUnits.findById("ou-temizlik-orta-MAR")).toBeDefined()
  })
})
