import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { renderApp } from "@/test/render"

async function fillRequired(
  user: ReturnType<typeof renderApp>["user"],
  tckn: string
) {
  await user.type(await screen.findByLabelText("Ad"), "Deniz")
  await user.type(screen.getByLabelText("Soyad"), "Öztürk")
  await user.type(screen.getByLabelText("T.C. Kimlik No"), tckn)
  await user.type(screen.getByLabelText("Sicil no"), "s90001")
  await user.type(screen.getByLabelText("Cep telefonu"), "0532 111 22 33")
}

describe("Batch 1.6 personel", () => {
  it("liste: KVKK maskesi ve arama", async () => {
    const { user } = renderApp({ route: "/personel" })
    const table = await screen.findByRole("table", { name: "Personel listesi" })
    await waitFor(() => {
      expect(within(table).getAllByRole("row").length).toBeGreaterThan(5)
    })
    const someone = db.personnel.findFirst(
      (person) => person.tenantId === "temizlik-orta"
    )!
    expect(within(table).queryByText(someone.tckn)).not.toBeInTheDocument()
    expect(within(table).getAllByText(/^\*{9}\d{2}$/).length).toBeGreaterThan(0)

    await user.type(
      screen.getByRole("searchbox", { name: "Personelde ara" }),
      someone.employeeNumber
    )
    await waitFor(() => {
      expect(within(table).getAllByRole("row")).toHaveLength(2)
    })
    expect(
      within(table).getByText(`${someone.firstName} ${someone.lastName}`)
    ).toBeInTheDocument()
  })

  it("TC-1.6-02 bölge filtresi URL'de kalır, yalnızca o bölge gelir", async () => {
    const { user, router } = renderApp({ route: "/personel" })
    await screen.findByRole("table", { name: "Personel listesi" })
    await user.click(screen.getByRole("combobox", { name: "Bölge filtresi" }))
    await user.click(await screen.findByRole("option", { name: "Ege" }))
    await waitFor(() => {
      expect(router.state.location.search).toContain(
        "orgUnitId=ou-temizlik-orta-EGE"
      )
    })
    const table = screen.getByRole("table", { name: "Personel listesi" })
    await waitFor(() => {
      const rows = within(table).getAllByRole("row").slice(1)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) expect(row).toHaveTextContent("Ege")
    })
  })

  it("kapsam: süpervizör yalnızca kendi lokasyonlarındaki personeli görür", async () => {
    renderApp({ user: "supervizor", route: "/personel" })
    const table = await screen.findByRole("table", { name: "Personel listesi" })
    const supervisor = db.users.findById("u-temizlik-orta-supervizor")!
    const allowed =
      supervisor.scope.kind === "locations" ? supervisor.scope.ids : []
    const expected = db.personnel.count(
      (person) =>
        person.tenantId === "temizlik-orta" &&
        person.homeLocationId !== null &&
        allowed.includes(person.homeLocationId)
    )
    await waitFor(() => {
      expect(within(table).getAllByRole("row").length - 1).toBe(expected)
    })
    expect(
      screen.queryByRole("link", { name: "Yeni personel" })
    ).not.toBeInTheDocument()
  })

  it("TC-1.6-01 geçersiz TCKN alan hatası verir", async () => {
    const { user } = renderApp({ route: "/personel/yeni" })
    await fillRequired(user, "12345678901")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText("Geçersiz T.C. Kimlik No")
    ).toBeInTheDocument()
  })

  it("TC-1.3-01 birden fazla tüzel kişilikli kiracıda işveren seçilmeden kaydedilemez", async () => {
    const { user } = renderApp({
      tenant: "cok-hatli-grup",
      route: "/personel/yeni",
    })
    await fillRequired(user, "10000000146")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(await screen.findByText("Tüzel kişilik seçin")).toBeInTheDocument()

    await user.click(
      screen.getByRole("combobox", { name: "İşveren (tüzel kişilik)" })
    )
    await user.click(
      await screen.findByRole("option", { name: "Çınar Teknik Hizmetler A.Ş." })
    )
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByRole("heading", { name: /Deniz Öztürk/ })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /S90001 · Temizlik personeli · Çınar Teknik Hizmetler A.Ş./
      )
    ).toBeInTheDocument()
  })

  it("sistemde kayıtlı TCKN sunucudan alan hatası olarak döner (422)", async () => {
    const existing = db.personnel.findFirst(
      (person) => person.tenantId === "temizlik-orta"
    )!
    const { user } = renderApp({ route: "/personel/yeni" })
    await fillRequired(user, existing.tckn)
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText(
        `Bu T.C. Kimlik No ${existing.employeeNumber} sicil numaralı personelde kayıtlı.`
      )
    ).toBeInTheDocument()
  })

  it("ayrılan personel için çıkış tarihi zorunlu", async () => {
    const { user } = renderApp({ route: "/personel/yeni" })
    await fillRequired(user, "10000000146")
    await user.click(screen.getByRole("combobox", { name: "Durum" }))
    await user.click(await screen.findByRole("option", { name: "Ayrıldı" }))
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText("Ayrılan personel için çıkış tarihi girin")
    ).toBeInTheDocument()
  })

  it("personel kartı: kimlik maskeli başlar, bilinçli gösterilir; sonraki faz sekmeleri", async () => {
    const person = db.personnel.findFirst(
      (item) => item.tenantId === "temizlik-orta" && item.phone !== null
    )!
    const { user } = renderApp({ route: `/personel/${person.id}` })
    expect(
      await screen.findByRole("heading", { name: new RegExp(person.firstName) })
    ).toBeInTheDocument()
    expect(screen.queryByText(person.tckn)).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "T.C. Kimlik No göster" })
    )
    expect(screen.getByText(person.tckn)).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Zimmet" }))
    expect(
      await screen.findByText("Bu sekme Faz 5'de doldurulacak.")
    ).toBeInTheDocument()
  })

  it("düzenleme yetkisi olmayan kullanıcıya tam kimlik bilgisi gönderilmez", async () => {
    const person = db.personnel.findFirst(
      (item) => item.tenantId === "temizlik-orta"
    )!
    db.users.update("u-temizlik-orta-operasyon", { scope: { kind: "all" } })
    renderApp({ user: "operasyon", route: `/personel/${person.id}` })
    expect(
      await screen.findByRole("heading", { name: new RegExp(person.firstName) })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "T.C. Kimlik No göster" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Düzenle" })
    ).not.toBeInTheDocument()
  })

  it("düzenleme formu mevcut değerlerle açılır ve kaydeder", async () => {
    const person = db.personnel.findFirst(
      (item) => item.tenantId === "temizlik-orta" && item.status === "active"
    )!
    const { user } = renderApp({ route: `/personel/${person.id}/duzenle` })
    const last = await screen.findByLabelText("Soyad")
    expect(last).toHaveValue(person.lastName)
    await user.clear(last)
    await user.type(last, "Yenisoyad")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByRole("heading", { name: new RegExp("Yenisoyad") })
    ).toBeInTheDocument()
  })
})
