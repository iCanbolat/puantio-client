import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { receiveReport } from "@/mocks/quality/store"
import { feedbackDemoAreaId } from "@/mocks/scenarios/phase4"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const TENANT = "temizlik-orta"
const OCTOBER = "2026-10-05T10:00:00+03:00"

describe("Batch 4.4 iş emirleri", () => {
  it("TC-4.4-02 SLA'sı aşılan iş emirleri listede en üstte ve kırmızı vurgulu", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("work-order-sla-breach")
    const { container } = renderApp({
      route: "/is-emirleri",
      user: "supervizor",
    })
    const table = await screen.findByRole("table", { name: "İş emirleri" })
    await waitFor(() => {
      expect(within(table).getAllByRole("row").length).toBeGreaterThan(3)
    })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("SLA aşımı: Su kaçağı")
    expect(rows[0]).toHaveClass("sla-breached")
    expect(within(rows[0]!).getByRole("timer")).toHaveAttribute(
      "data-state",
      "breached"
    )
    expect(rows[1]).toHaveTextContent("SLA aşımı: Aydınlatma arızası")
    const onTime = rows.find((row) =>
      row.textContent.includes("Zamanında: Cam silme")
    )!
    expect(onTime).not.toHaveClass("sla-breached")
    await expectNoA11yViolations(container)
  })

  it("pano: kart menüsünden atama → 'Atandı' sütununa geçer; geçersiz eylem menüde yok", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("work-order-sla-breach")
    const { user, container } = renderApp({
      route: "/is-emirleri?gorunum=kanban",
      user: "supervizor",
    })
    const board = await screen.findByRole("region", { name: "İş emri panosu" })
    const newColumn = within(board).getByRole("region", { name: /^Yeni/ })
    const card = await within(newColumn).findByRole("article", {
      name: /Zamanında: Cam silme/,
    })
    await expectNoA11yViolations(container)
    const number = card.getAttribute("aria-label")!.split(" ")[0]!
    await user.click(
      within(card).getByRole("button", { name: `${number} işlemleri` })
    )
    expect(
      screen.queryByRole("menuitem", { name: "Tamamla" })
    ).not.toBeInTheDocument()
    await user.click(await screen.findByRole("menuitem", { name: "Ata" }))
    const dialog = await screen.findByRole("dialog", { name: "Ata" })
    // Personel seçmeden atanamaz
    await user.click(within(dialog).getByRole("button", { name: "Ata" }))
    expect(
      within(dialog).getByText("Atanacak personeli seçin")
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole("combobox", { name: "Atanacak personel" })
    )
    const options = await screen.findAllByRole("option")
    expect(options[0]).toHaveTextContent("Bu lokasyonda")
    await user.click(options[0]!)
    await user.click(within(dialog).getByRole("button", { name: "Ata" }))
    expect(await screen.findByText(`Ata: ${number}`)).toBeInTheDocument()
    await waitFor(() => {
      const assigned = within(board).getByRole("region", { name: /^Atandı/ })
      expect(
        within(assigned).getByRole("article", { name: /Zamanında: Cam silme/ })
      ).toBeInTheDocument()
    })
  })

  it("TC-4.4-04 başka kanaldan gelen bildirim realtime ile listeye düşer; birleşince bildirim sayısı artar", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("quality-demo")
    renderApp({ route: "/is-emirleri", user: "supervizor" })
    const table = await screen.findByRole("table", { name: "İş emirleri" })
    await screen.findByText("Canlı")
    const tenant = db.tenants.findById(TENANT)!
    const input = {
      locationId: db.areas.findById(feedbackDemoAreaId(TENANT))!.locationId,
      areaId: feedbackDemoAreaId(TENANT),
      categoryCode: "odor",
      channel: "qr" as const,
      note: null,
      photoId: null,
      actorName: "QR bildirimi",
    }
    receiveReport(tenant, {
      ...input,
      receivedAt: mockClock.now().toISOString(),
    })
    expect(
      await within(table).findByText("Kötü koku · Zemin kat WC")
    ).toBeInTheDocument()
    receiveReport(tenant, {
      ...input,
      receivedAt: mockClock.now().toISOString(),
    })
    await waitFor(() => {
      expect(within(table).getByText(/· 2 bildirim/)).toBeInTheDocument()
    })
  })

  it("detay: iptal gerekçe ister; tamamlanan iş emri doğrulanır ve geçmişe yazılır", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("work-order-sla-breach")
    const order = db.workOrders.findFirst(
      (item) => item.title === "SLA aşımı: Su kaçağı"
    )!
    const { user, container } = renderApp({
      route: `/is-emirleri/${order.id}`,
      user: "supervizor",
    })
    expect(
      await screen.findByRole("heading", { name: "SLA aşımı: Su kaçağı" })
    ).toBeInTheDocument()
    await expectNoA11yViolations(container)
    await user.click(screen.getByRole("button", { name: "İptal et" }))
    const dialog = await screen.findByRole("dialog", { name: "İptal et" })
    await user.click(within(dialog).getByRole("button", { name: "İptal et" }))
    expect(
      within(dialog).getByText("Gerekçe en az 5 karakter olmalı")
    ).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Gerekçe"), "Mükerrer kayıt")
    await user.click(within(dialog).getByRole("button", { name: "İptal et" }))
    await waitFor(() => {
      expect(screen.getByText("İptal edildi")).toBeInTheDocument()
    })
    expect(screen.getAllByText("Mükerrer kayıt").length).toBeGreaterThan(0)
    expect(
      screen.queryByRole("button", { name: "İptal et" })
    ).not.toBeInTheDocument()

    // Tamamlanmış iş emri: doğrula
    db.workOrders.update(order.id, {
      status: "completed",
      completedAt: OCTOBER,
      cancelReason: null,
    })
    const second = renderApp({
      route: `/is-emirleri/${order.id}`,
      user: "supervizor",
    })
    await second.user.click(
      await screen
        .findAllByRole("button", { name: "Doğrula" })
        .then((buttons) => buttons.at(-1)!)
    )
    const verify = await screen.findByRole("dialog", { name: "Doğrula" })
    await second.user.click(
      within(verify).getByRole("button", { name: "Doğrula" })
    )
    await waitFor(() => {
      expect(db.workOrders.findById(order.id)!.status).toBe("verified")
    })
  })

  it("manuel iş emri oluşturma ve yetki: süpervizör oluşturur, operasyon dışı rol göremez", async () => {
    mockClock.freeze(OCTOBER)
    const { user, router } = renderApp({
      route: "/is-emirleri",
      user: "supervizor",
    })
    await user.click(
      await screen.findByRole("button", { name: "Yeni iş emri" })
    )
    const dialog = await screen.findByRole("dialog", { name: "Yeni iş emri" })
    await user.click(within(dialog).getByRole("button", { name: "Oluştur" }))
    expect(
      await within(dialog).findByText("Başlık en az 3 karakter")
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Lokasyon seçin")).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Başlık"), "Cam silme")
    await user.click(within(dialog).getByRole("combobox", { name: "Lokasyon" }))
    await user.click((await screen.findAllByRole("option"))[0]!)
    await user.click(within(dialog).getByRole("button", { name: "Oluştur" }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/is-emirleri\/wo-/)
    })
    expect(
      await screen.findByRole("heading", { name: "Cam silme" })
    ).toBeInTheDocument()
  })

  it("İK rolü iş emirlerine erişemez; bölge sorumlusu kataloğu görür ama düzenleyemez", async () => {
    const hr = renderApp({ route: "/is-emirleri", user: "ik" })
    expect(
      await screen.findByText("Bu sayfaya erişim yetkiniz yok")
    ).toBeInTheDocument()
    hr.unmount()
    renderApp({ route: "/ayarlar/bildirim-katalogu", user: "bolge" })
    expect(await screen.findByText("Kağıt havlu bitti")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Sorun ekle" })
    ).not.toBeInTheDocument()
  })

  it("bildirim kataloğu: madde düzenlenir, kod benzersizliği istemcide doğrulanır", async () => {
    const { user, container } = renderApp({
      route: "/ayarlar/bildirim-katalogu",
      user: "supervizor",
    })
    const table = await screen.findByRole("table")
    expect(within(table).getByText("Kağıt havlu bitti")).toBeInTheDocument()
    await expectNoA11yViolations(container)
    await user.click(screen.getByRole("button", { name: "Sorun ekle" }))
    const dialog = await screen.findByRole("dialog", { name: "Sorun ekle" })
    await user.type(within(dialog).getByLabelText("Etiket"), "Kapı kolu kırık")
    await user.type(within(dialog).getByLabelText("Kod"), "soap")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(within(dialog).getByText("Bu kod zaten var")).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText("Kod"))
    await user.type(within(dialog).getByLabelText("Kod"), "door_handle")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await within(table).findByText("Kapı kolu kırık")
    ).toBeInTheDocument()
    expect(
      db.issueCatalogs
        .findById(TENANT)!
        .items.some((item) => item.code === "door_handle")
    ).toBe(true)
  })
})
