import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { renderApp } from "@/test/render"

const ROUTE = "/gelistirici/bilesenler"

async function openEditDialog(code: string) {
  const app = renderApp({ route: `${ROUTE}?q=${code}` })
  await app.user.click(
    await screen.findByRole("button", { name: `${code} kaydını düzenle` })
  )
  const dialog = await screen.findByRole("dialog", { name: "Kaydı düzenle" })
  return { ...app, dialog }
}

describe("vitrin: form deseni", () => {
  it("TC-0.3-04c istemci doğrulaması Zod mesajlarını alan altında gösterir", async () => {
    const { user, dialog } = await openEditDialog("WLC-00002")
    const score = within(dialog).getByLabelText("Kalite puanı")
    await user.clear(score)
    await user.type(score, "150")
    await user.clear(within(dialog).getByLabelText("Ad"))
    await user.type(within(dialog).getByLabelText("Ad"), "ab")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))

    expect(
      await within(dialog).findByText("Puan 100'den büyük olamaz")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText("Ad en az 3 karakter olmalı")
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Ad")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
  })

  it("TC-0.3-04d sunucunun 422 alan hatası aynı alana yazılır", async () => {
    const taken = db.showcaseRecords.findFirst(
      (record) => record.code === "WLC-00001"
    )!
    const { user, dialog } = await openEditDialog("WLC-00002")
    const name = within(dialog).getByLabelText("Ad")
    await user.clear(name)
    await user.type(name, taken.name)
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))

    expect(
      await within(dialog).findByText(
        `Bu ad WLC-00001 kodlu kayıtta kullanılıyor.`
      )
    ).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("TC-0.3-04e başarılı kayıt diyalogu kapatır, toast gösterir ve listeyi yeniler", async () => {
    const { user, dialog } = await openEditDialog("WLC-00003")
    const name = within(dialog).getByLabelText("Ad")
    await user.clear(name)
    await user.type(name, "Yenilenen Kayıt Adı")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))

    expect(await screen.findByText("Kayıt güncellendi")).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    expect(await screen.findByText("Yenilenen Kayıt Adı")).toBeInTheDocument()
  })

  it("TC-0.6-17 sekme seçimi URL'de tutulur", async () => {
    const { user, router } = renderApp({ route: ROUTE })
    await user.click(await screen.findByRole("tab", { name: "Zaman ve SLA" }))
    await waitFor(() => {
      expect(router.state.location.search).toBe("?bolum=zaman")
    })
    expect(await screen.findByText("SLA geri sayımı")).toBeInTheDocument()
    expect(screen.getAllByRole("timer")).toHaveLength(3)
  })

  it("dosya ve durum bileşenleri sekmeleri", async () => {
    const { user } = renderApp({ route: `${ROUTE}?bolum=dosya` })
    expect(await screen.findByText("Excel dosyası yükle")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Durum bileşenleri" }))
    expect(await screen.findByText("Gelmedi")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin."
      )
    ).toBeInTheDocument()
  })

  it("tekli silme onay diyaloğu ile yapılır", async () => {
    const { user } = renderApp({ route: `${ROUTE}?q=WLC-00004` })
    await user.click(
      await screen.findByRole("button", { name: "WLC-00004 kaydını sil" })
    )
    const dialog = await screen.findByRole("alertdialog", {
      name: "Kayıt silinsin mi?",
    })
    await user.click(within(dialog).getByRole("button", { name: "Sil" }))
    expect(await screen.findByText("WLC-00004 silindi")).toBeInTheDocument()
    expect(
      db.showcaseRecords.findFirst((record) => record.code === "WLC-00004")
    ).toBeUndefined()
  })
})
