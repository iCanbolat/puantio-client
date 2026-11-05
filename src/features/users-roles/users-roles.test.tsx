import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { db } from "@/mocks/db"
import { http } from "@/shared/api/http"
import { ApiError } from "@/shared/api/errors"
import { renderApp, renderWithProviders } from "@/test/render"

describe("Batch 1.2–1.3 roller ve kullanıcılar", () => {
  it("TC-1.2-02 özel rol 'Proje Şefi': sağlık yetkisi atanamaz, rol kadar menü", async () => {
    const { user } = renderApp({ route: "/ayarlar/roller" })
    await user.click(await screen.findByRole("button", { name: "Yeni rol" }))
    const dialog = await screen.findByRole("dialog", { name: "Yeni özel rol" })
    await user.type(within(dialog).getByLabelText("Rol adı"), "Proje Şefi")
    expect(
      within(dialog).getByRole("checkbox", { name: /Sağlık verisi görüntüle/ })
    ).toHaveAttribute("data-disabled")
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Personeli görüntüle" })
    )
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Lokasyonları görüntüle" })
    )
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(await screen.findByText("Proje Şefi")).toBeInTheDocument()

    const role = db.roles.findFirst((item) => item.name === "Proje Şefi")!
    expect(role.permissions).toEqual(["personnel:read", "location:read"])
    db.users.update("u-temizlik-orta-ek-1", {
      roleIds: [role.id],
      scope: { kind: "all" },
    })
  })

  it("TC-1.2-02 (devam) özel rollü kullanıcı yalnızca rolündeki menüleri görür; sağlık yetkisi API'de de reddedilir", async () => {
    db.roles.insert({
      id: "rol-proje-sefi",
      tenantId: "temizlik-orta",
      name: "Proje Şefi",
      description: null,
      kind: "custom",
      templateKey: null,
      permissions: ["personnel:read", "location:read"],
    })
    db.users.update("u-temizlik-orta-ek-1", {
      roleIds: ["rol-proje-sefi"],
      scope: { kind: "all" },
    })
    renderApp({ user: "ek-1" })
    const nav = await screen.findByLabelText("Ana menü")
    await within(nav).findByRole("link", { name: /Personel/ })
    expect(
      within(nav).getByRole("link", { name: /Lokasyonlar/ })
    ).toBeInTheDocument()
    expect(
      within(nav).queryByRole("link", { name: /Müşteriler/ })
    ).not.toBeInTheDocument()
    expect(within(nav).queryByText("Ayarlar")).not.toBeInTheDocument()

    renderWithProviders(<span />)
    const error = await http
      .post("/roles", z.unknown(), {
        body: {
          name: "Sızıntı",
          description: null,
          permissions: ["health:read"],
        },
      })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
  })

  it("sistem rolü kopyalanarak özel rol oluşturulur", async () => {
    const { user } = renderApp({ route: "/ayarlar/roller" })
    await user.click(
      await screen.findByRole("button", { name: "İSG uzmanı rolünü kopyala" })
    )
    const dialog = await screen.findByRole("dialog", { name: "Yeni özel rol" })
    expect(within(dialog).getByLabelText("Rol adı")).toHaveValue(
      "İSG uzmanı (özel)"
    )
    expect(
      within(dialog).getByRole("checkbox", {
        name: "İSG eğitim ve sertifikaları görüntüle",
      })
    ).toBeChecked()
    expect(
      within(dialog).getByRole("checkbox", { name: /Sağlık verisi görüntüle/ })
    ).not.toBeChecked()
  })

  it("kullanıcı daveti: mükerrer e-posta reddedilir, rol ve kapsam atanır", async () => {
    const { user } = renderApp({ route: "/ayarlar/kullanicilar" })
    await user.click(
      await screen.findByRole("button", { name: "Kullanıcı davet et" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Kullanıcı davet et",
    })
    await user.type(
      within(dialog).getByLabelText("E-posta"),
      "elif.kaya@lavanta.example"
    )
    await user.type(within(dialog).getByLabelText("Ad soyad"), "Elif Kaya")
    await user.click(
      await within(dialog).findByRole("checkbox", { name: "Bölge sorumlusu" })
    )
    await user.click(within(dialog).getByRole("radio", { name: "Bölgeler" }))
    await user.click(
      within(dialog).getByRole("button", { name: "Davet gönder" })
    )
    expect(
      await within(dialog).findByText("Kapsam için en az bir kayıt seçin")
    ).toBeInTheDocument()

    await user.click(
      await within(dialog).findByRole("checkbox", { name: "Ege" })
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Davet gönder" })
    )
    expect(
      await within(dialog).findByText("Bu e-posta ile bir kullanıcı zaten var.")
    ).toBeInTheDocument()

    const email = within(dialog).getByLabelText("E-posta")
    await user.clear(email)
    await user.type(email, "yeni.sorumlu@lavanta.example")
    await user.click(
      within(dialog).getByRole("button", { name: "Davet gönder" })
    )
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    const invited = db.users.findFirst(
      (item) => item.email === "yeni.sorumlu@lavanta.example"
    )!
    expect(invited).toMatchObject({
      status: "invited",
      scope: { kind: "org_units", ids: ["ou-temizlik-orta-EGE"] },
    })
  })

  it("kullanıcı devre dışı bırakılır; kendi hesabında işlem yok", async () => {
    const { user } = renderApp({ route: "/ayarlar/kullanicilar?q=Murat" })
    await user.click(
      await screen.findByRole("button", {
        name: "Murat Demir devre dışı bırak",
      })
    )
    await user.click(
      await screen.findByRole("button", { name: "Devre dışı bırak" })
    )
    await waitFor(() => {
      expect(db.users.findById("u-temizlik-orta-operasyon")?.status).toBe(
        "disabled"
      )
    })
    expect(
      screen.queryByRole("button", { name: /Ayşe Yılmaz devre dışı/ })
    ).not.toBeInTheDocument()
  })
})
