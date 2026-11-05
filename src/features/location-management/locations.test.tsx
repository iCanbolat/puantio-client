import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { renderApp } from "@/test/render"

function firstLocation(tenant = "temizlik-orta") {
  return db.locations.findFirst((location) => location.tenantId === tenant)!
}

describe("Batch 1.5 lokasyonlar", () => {
  it("liste: müşteri ve bölge kolonları, satır seçince toplu etiket baskısı bağlantısı", async () => {
    const { user } = renderApp({ route: "/lokasyonlar" })
    const table = await screen.findByRole("table", { name: "Lokasyonlar" })
    await waitFor(() => {
      expect(within(table).getAllByRole("row").length).toBeGreaterThan(5)
    })
    const location = firstLocation()
    expect(within(table).getByText(location.code)).toBeInTheDocument()
    await user.click(
      within(table).getAllByRole("checkbox", { name: "Satırı seç" })[0]!
    )
    const link = await screen.findByRole("link", {
      name: /QR etiketlerini bas \(1\)/,
    })
    expect(link).toHaveAttribute(
      "href",
      `/etiket-baski?lokasyon=${location.id}`
    )
  })

  it("harita görünümü URL'de tutulur ve nokta sayısını bildirir", async () => {
    const { user, router } = renderApp({ route: "/lokasyonlar" })
    await user.click(await screen.findByRole("button", { name: "Harita" }))
    await waitFor(() => {
      expect(router.state.location.search).toContain("gorunum=harita")
    })
    const count = db.locations.count(
      (location) => location.tenantId === "temizlik-orta"
    )
    expect(
      await screen.findByText(
        `${count} lokasyon haritada. Kümeye tıklayınca yakınlaşır.`
      )
    ).toBeInTheDocument()
  })

  it("TC-1.5-01 geofence yarıçapı 10 m / 2000 m: sınır dışı uyarısı", async () => {
    const { user } = renderApp({ route: "/lokasyonlar/yeni" })
    const radius = await screen.findByLabelText("Geofence yarıçapı (metre)")
    await user.clear(radius)
    await user.type(radius, "10")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText("Yarıçap en az 25 m olmalı")
    ).toBeInTheDocument()

    await user.clear(radius)
    await user.type(radius, "2000")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText("Yarıçap en fazla 1000 m olabilir")
    ).toBeInTheDocument()
  })

  it("geofence sınırları kiracı ayarından gelir (güvenlik firması 15–500 m)", async () => {
    const { user } = renderApp({
      tenant: "guvenlik",
      route: "/lokasyonlar/yeni",
    })
    expect(
      await screen.findByRole("heading", { name: "Yeni görev yeri" })
    ).toBeInTheDocument()
    expect(
      screen.getByText("İzin verilen aralık 15–500 m.")
    ).toBeInTheDocument()
    const radius = screen.getByLabelText("Geofence yarıçapı (metre)")
    await user.clear(radius)
    await user.type(radius, "600")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText("Yarıçap en fazla 500 m olabilir")
    ).toBeInTheDocument()
  })

  it("lokasyon oluşturulur: müşteri araması, bölge seçimi, kod çakışması", async () => {
    const customer = db.customers.findFirst(
      (item) => item.tenantId === "temizlik-orta"
    )!
    const existing = firstLocation()
    const { user } = renderApp({ route: "/lokasyonlar/yeni" })
    await user.type(await screen.findByLabelText("Kod"), existing.code)
    await user.type(screen.getByLabelText("Ad"), "Yeni Genel Müdürlük")
    await user.type(
      screen.getByRole("combobox", { name: "Müşteri" }),
      customer.name.slice(0, 5)
    )
    await user.click(
      await screen.findByRole("option", { name: new RegExp(customer.name) })
    )
    await user.click(screen.getByRole("combobox", { name: "Bölge" }))
    await user.click(await screen.findByRole("option", { name: "Ege" }))
    await user.type(screen.getByLabelText("İl"), "İzmir")
    await user.type(screen.getByLabelText("İlçe"), "Konak")
    await user.type(
      screen.getByLabelText("Açık adres"),
      "Cumhuriyet Bulvarı No:1"
    )
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText("Bu kod başka bir kayıtta kullanılıyor.")
    ).toBeInTheDocument()

    const code = screen.getByLabelText("Kod")
    await user.clear(code)
    await user.type(code, "lok-99999")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByRole("heading", { name: "Yeni Genel Müdürlük" })
    ).toBeInTheDocument()
    expect(screen.getByText(`LOK-99999 · ${customer.name}`)).toBeInTheDocument()
  })

  it("alan eklenir", async () => {
    const location = firstLocation()
    const { user } = renderApp({
      route: `/lokasyonlar/${location.id}?sekme=alanlar`,
    })
    await user.click(await screen.findByRole("button", { name: "Yeni alan" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(
      within(dialog).getByLabelText("Ad"),
      "Zemin kat kadın tuvaleti"
    )
    await user.type(within(dialog).getByLabelText("Kat"), "Zemin")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByRole("cell", { name: "Zemin kat kadın tuvaleti" })
    ).toBeInTheDocument()
  })

  it("TC-1.5-02 etiket yeniden üretilir: onay diyaloğu, eski token iptal", async () => {
    const location = firstLocation()
    const oldToken = db.tags.findFirst(
      (tag) =>
        tag.targetId === location.id &&
        tag.kind === "qr" &&
        tag.status === "active"
    )!.value
    const { user } = renderApp({
      route: `/lokasyonlar/${location.id}?sekme=etiketler`,
    })
    const token = await screen.findByTestId(`qr-${location.id}`)
    await waitFor(() => {
      expect(token).toHaveTextContent(oldToken)
    })
    await user.click(
      screen.getByRole("button", {
        name: "Lokasyon girişi QR etiketini yeniden üret",
      })
    )
    const dialog = await screen.findByRole("alertdialog", {
      name: "QR etiketi yeniden üretilsin mi?",
    })
    await user.click(
      within(dialog).getByRole("button", { name: "Yeniden üret" })
    )
    await waitFor(() => {
      expect(screen.getByTestId(`qr-${location.id}`)).not.toHaveTextContent(
        oldToken
      )
    })
    const revoked = await screen.findByRole("table", {
      name: "İptal edilen etiketler",
    })
    expect(within(revoked).getByText(oldToken)).toBeInTheDocument()
    expect(db.tags.findFirst((tag) => tag.value === oldToken)?.status).toBe(
      "revoked"
    )
    expect(
      db.auditEvents.findFirst(
        (event) => event.action === "QR etiketi yeniden üretildi"
      )
    ).toBeDefined()
  })

  it("NFC etiketi: geçersiz UID reddedilir, geçerli UID atanır", async () => {
    const location = firstLocation()
    const area = db.areas.findFirst((item) => item.locationId === location.id)!
    const { user } = renderApp({
      route: `/lokasyonlar/${location.id}?sekme=etiketler`,
    })
    await user.click(
      await screen.findByRole("button", {
        name: `${area.name} için NFC etiketi ata`,
      })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "NFC etiketi ata",
    })
    const input = within(dialog).getByLabelText("Etiket UID")
    await user.type(input, "zz")
    await user.click(within(dialog).getByRole("button", { name: "Ata" }))
    expect(
      await within(dialog).findByText(/NFC UID 4, 7 veya 10 bayt olmalı/)
    ).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, "04:a2:3b:1c:5d:80:90")
    await user.click(within(dialog).getByRole("button", { name: "Ata" }))
    expect(await screen.findByText("04:A2:3B:1C:5D:80:90")).toBeInTheDocument()
  })

  it("TC-1.5-03 40 alan için A4 baskı sayfası: her etikette QR, lokasyon ve alan adı", async () => {
    const location = firstLocation()
    for (const area of db.areas.findMany(
      (item) => item.locationId === location.id
    ))
      db.areas.remove(area.id)
    for (const tag of db.tags.findMany(
      (item) => item.locationId === location.id && item.targetType === "area"
    ))
      db.tags.remove(tag.id)
    for (let index = 1; index <= 40; index += 1) {
      db.areas.insert({
        id: `a40-${index}`,
        tenantId: "temizlik-orta",
        locationId: location.id,
        name: `Alan ${index}`,
        type: "restroom",
        floor: null,
      })
      db.tags.insert({
        id: `t40-${index}`,
        tenantId: "temizlik-orta",
        targetType: "area",
        targetId: `a40-${index}`,
        locationId: location.id,
        kind: "qr",
        value: `TOKEN${String(index).padStart(5, "0")}`,
        status: "active",
        createdAt: "2026-09-01T09:00:00+03:00",
        revokedAt: null,
      })
    }
    renderApp({ route: `/etiket-baski?lokasyon=${location.id}` })
    const list = await screen.findByRole("list", { name: "Etiketler" })
    await waitFor(() => {
      expect(within(list).getAllByRole("listitem")).toHaveLength(41)
    })
    expect(screen.getByText("41 etiket")).toBeInTheDocument()
    await waitFor(() => {
      expect(
        within(list).getAllByRole("img", { name: /^Alan \d+ QR kodu$/ })
      ).toHaveLength(40)
    })
    const label = within(list).getAllByRole("listitem")[5]!
    expect(label).toHaveTextContent("Alan 5")
    expect(label).toHaveTextContent(location.name)
    expect(within(list).getAllByRole("img")[1]).toHaveAttribute(
      "data-qr-value",
      expect.stringContaining("/q/TOKEN00001")
    )
    expect(screen.queryByLabelText("Ana menü")).not.toBeInTheDocument()
  })

  it("lokasyon kapsamı dışındaki karta erişilemez", async () => {
    const supervisor = db.users.findById("u-temizlik-orta-supervizor")!
    const allowed =
      supervisor.scope.kind === "locations" ? supervisor.scope.ids : []
    const outside = db.locations.findFirst(
      (location) =>
        location.tenantId === "temizlik-orta" && !allowed.includes(location.id)
    )!
    renderApp({ user: "supervizor", route: `/lokasyonlar/${outside.id}` })
    expect(await screen.findByText("Kayıt bulunamadı.")).toBeInTheDocument()
  })
})

describe("lokasyon düzenleme", () => {
  it("düzenleme formu mevcut değerlerle açılır, kaydedince karta döner", async () => {
    const location = db.locations.findFirst(
      (item) => item.tenantId === "temizlik-orta"
    )!
    const { user } = renderApp({ route: `/lokasyonlar/${location.id}/duzenle` })
    const name = await screen.findByLabelText("Ad")
    expect(name).toHaveValue(location.name)
    expect(screen.getByRole("combobox", { name: "Müşteri" })).toHaveValue(
      db.customers.findById(location.customerId)!.name
    )
    await user.clear(name)
    await user.type(name, "Güncellenmiş Lokasyon")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByRole("heading", { name: "Güncellenmiş Lokasyon" })
    ).toBeInTheDocument()
  })
})
