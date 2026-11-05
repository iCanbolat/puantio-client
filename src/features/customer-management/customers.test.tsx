import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { renderApp } from "@/test/render"

describe("Batch 1.4 müşteriler", () => {
  it("liste, tür filtresi ve müşteri kartı (lokasyonları ile)", async () => {
    const { user, router } = renderApp({ route: "/musteriler" })
    const table = await screen.findByRole("table", { name: "Müşteriler" })
    await user.click(screen.getByRole("combobox", { name: "Tür filtresi" }))
    await user.click(await screen.findByRole("option", { name: "Kamu" }))
    await waitFor(() => {
      expect(router.state.location.search).toContain("type=public")
    })
    await waitFor(() => {
      const rows = within(table).getAllByRole("row").slice(1)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) expect(row).toHaveTextContent("Kamu")
    })

    const customer = db.customers.findFirst(
      (item) => item.tenantId === "temizlik-orta" && item.type === "public"
    )!
    await user.click(within(table).getByRole("link", { name: customer.name }))
    expect(
      await screen.findByRole("heading", { name: customer.name })
    ).toBeInTheDocument()
    const location = db.locations.findFirst(
      (item) => item.customerId === customer.id
    )!
    expect(
      await screen.findByRole("link", { name: location.name })
    ).toBeInTheDocument()
  })

  it("yeni müşteri: VKN doğrulaması ve iletişim kişisi", async () => {
    const { user } = renderApp({ route: "/musteriler" })
    await user.click(
      await screen.findByRole("button", { name: "Yeni müşteri" })
    )
    const dialog = await screen.findByRole("dialog", { name: "Yeni müşteri" })
    await user.type(
      within(dialog).getByLabelText("Müşteri adı"),
      "Deniz Lojistik"
    )
    await user.type(
      within(dialog).getByLabelText("Vergi kimlik no"),
      "1234567891"
    )
    await user.click(
      within(dialog).getByRole("button", { name: "İletişim kişisi ekle" })
    )
    await user.type(within(dialog).getByLabelText("Ad soyad"), "Mert Can")
    await user.type(within(dialog).getByLabelText("E-posta"), "gecersiz")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await within(dialog).findByText("Geçersiz vergi kimlik numarası")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText("Geçerli bir e-posta girin")
    ).toBeInTheDocument()

    const vkn = within(dialog).getByLabelText("Vergi kimlik no")
    await user.clear(vkn)
    await user.type(vkn, "1234567890")
    const email = within(dialog).getByLabelText("E-posta")
    await user.clear(email)
    await user.type(email, "mert@deniz.example")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    const created = db.customers.findFirst(
      (item) => item.name === "Deniz Lojistik"
    )!
    expect(created.contacts[0]).toMatchObject({
      name: "Mert Can",
      email: "mert@deniz.example",
      isPrimary: true,
    })
  })

  it("müşteri kullanıcısı yalnızca kendi müşterisini görür", async () => {
    db.roles.update("rol-temizlik-orta-customer_admin", {
      permissions: [
        ...db.roles.findById("rol-temizlik-orta-customer_admin")!.permissions,
        "customer:read",
      ],
    })
    renderApp({ user: "musteri", route: "/musteriler" })
    const table = await screen.findByRole("table", { name: "Müşteriler" })
    await waitFor(() => {
      expect(within(table).getAllByRole("row")).toHaveLength(2)
    })
  })
})
