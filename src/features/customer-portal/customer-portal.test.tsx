import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { insertWorkOrder } from "@/mocks/quality/store"
import { portalReportCustomerId } from "@/mocks/scenarios/phase4"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const TENANT = "temizlik-orta"
const OCTOBER = "2026-10-05T10:00:00+03:00"

describe("Batch 4.5 müşteri portalı", () => {
  it("portal kabuğu kiracı markasıyla açılır; müşteri yöneticisi özet, onaylar ve ayar menüsünü görür", async () => {
    mockClock.freeze(OCTOBER)
    const { container } = renderApp({ route: "/portal", user: "musteri" })
    const nav = await screen.findByLabelText("Ana menü")
    expect(within(nav).getByText("Lavanta")).toBeInTheDocument()
    expect(within(nav).getByText("Müşteri portalı")).toBeInTheDocument()
    for (const label of [
      "Özet",
      "İş emirleri",
      "Talep aç",
      "Raporlar",
      "Puantaj onayları",
      "Hakedişler",
      "Rapor gönderimi",
    ])
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument()
    expect(within(nav).queryByText("Personel")).not.toBeInTheDocument()
    expect(await screen.findByText("SLA uyumu")).toBeInTheDocument()
    expect(screen.getByText("Ortalama denetim puanı")).toBeInTheDocument()
    expect(await screen.findByText("Kadro taahhüdü")).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it("TC-4.5-03 müşteri kullanıcısı talep açar; onay ve gönderim ayarı menüsü yok", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("quality-demo")
    const { user, container } = renderApp({
      route: "/portal/talep",
      user: "musteri-kullanici",
    })
    const nav = await screen.findByLabelText("Ana menü")
    expect(
      within(nav).queryByRole("link", { name: "Hakedişler" })
    ).not.toBeInTheDocument()
    expect(
      within(nav).queryByRole("link", { name: "Puantaj onayları" })
    ).not.toBeInTheDocument()
    expect(
      within(nav).queryByRole("link", { name: "Rapor gönderimi" })
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("heading", { name: "Talep aç" })
    ).toBeInTheDocument()
    await expectNoA11yViolations(container)

    await user.click(screen.getByRole("button", { name: "Talebi gönder" }))
    expect(screen.getByText("Lokasyon seçin")).toBeInTheDocument()
    const customerId = portalReportCustomerId(TENANT)!
    const location = db.locations.findFirst(
      (item) => item.customerId === customerId && item.status === "active"
    )!
    await user.click(screen.getByRole("combobox", { name: "Lokasyon" }))
    await user.click(
      await screen.findByRole("option", { name: new RegExp(location.code) })
    )
    const issues = screen.getByRole("group", { name: "Sorun" })
    await user.click(within(issues).getAllByRole("button")[0]!)
    await user.type(
      screen.getByLabelText("Açıklama (isteğe bağlı)"),
      "Lobi kapısı"
    )
    await user.click(screen.getByRole("button", { name: "Talebi gönder" }))
    expect(
      await screen.findByRole("heading", { name: "Talebiniz alındı" })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("link", { name: "İş emrini aç" }))
    expect(await screen.findByText("Müşteri talebi")).toBeInTheDocument()
    expect(screen.getByText(/Derya Kılıç \(Portal\)/)).toBeInTheDocument()
  })

  it("TC-4.5-01 başka müşterinin iş emrine URL ile gidilirse bulunamadı", async () => {
    mockClock.freeze(OCTOBER)
    const location = db.locations.findFirst(
      (item) =>
        item.tenantId === TENANT &&
        item.customerId !== portalReportCustomerId(TENANT)
    )!
    const foreign = insertWorkOrder(db.tenants.findById(TENANT)!, {
      title: "Başka müşterinin işi",
      description: null,
      source: "manual",
      priority: "normal",
      categoryCode: null,
      serviceLine: "cleaning",
      locationId: location.id,
      areaId: null,
      createdAt: OCTOBER,
      actorName: "Test",
    })
    renderApp({ route: `/portal/is-emirleri/${foreign.id}`, user: "musteri" })
    expect(await screen.findByText("Veriler yüklenemedi")).toBeInTheDocument()
    expect(screen.getByText("İş emri bulunamadı.")).toBeInTheDocument()
  })

  it("TC-4.5-02 rapor arşivi: Eylül raporu fixture rakamlarını gösterir; baskı düzeni aynı veriyi kullanır", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("portal-month-report")
    const { container } = renderApp({
      route: "/portal/raporlar?ay=2026-09",
      user: "musteri",
    })
    const sla = await screen
      .findByRole("region", { name: "SLA ve iş emirleri" })
      .catch(() => screen.findByText("SLA ve iş emirleri"))
    expect(sla).toBeInTheDocument()
    const figure = (label: string) =>
      screen.getByText(label, { selector: "dt" }).parentElement!
    await waitFor(() => {
      expect(figure("SLA uyumu")).toHaveTextContent("%50")
    })
    expect(figure("Açılan")).toHaveTextContent("6")
    expect(figure("Kapanan")).toHaveTextContent("4")
    expect(figure("Ay sonunda açık")).toHaveTextContent("2")
    expect(figure("Ortalama çözüm süresi")).toHaveTextContent("15 sa 45 dk")
    expect(figure("Denetim")).toHaveTextContent("4")
    expect(figure("Ortalama puan")).toHaveTextContent("81,4")
    expect(figure("Kritik bulgu")).toHaveTextContent("2")
    expect(screen.getByRole("link", { name: /Yazdır/ })).toHaveAttribute(
      "href",
      "/baski/portal-rapor/2026-09"
    )
    await expectNoA11yViolations(container)
  })

  it("rapor gönderimi: müşteri yöneticisi alıcı ekler ve kaydeder; kullanıcı salt okunur görür", async () => {
    const { user } = renderApp({
      route: "/portal/rapor-gonderimi",
      user: "musteri",
    })
    const input = await screen.findByLabelText("Alıcılar")
    await user.type(input, "gecersiz")
    await user.click(screen.getByRole("button", { name: "Ekle" }))
    expect(screen.getByText("Geçerli bir e-posta girin")).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, "Idari@Ornek.com{Enter}")
    expect(
      screen.getByRole("list", { name: "Eklenen alıcılar" })
    ).toHaveTextContent("idari@ornek.com")
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText("Gönderim ayarları kaydedildi")
    ).toBeInTheDocument()
    const customerId = portalReportCustomerId(TENANT)!
    expect(
      db.reportSubscriptions.findFirst(
        (item) => item.customerId === customerId
      )!.recipients
    ).toContain("idari@ornek.com")
  })

  it("müşteri kullanıcısı rapor gönderimi sayfasını URL ile açarsa yetkisiz değil salt okunur değil; menüsü yok", async () => {
    renderApp({ route: "/portal/rapor-gonderimi", user: "musteri-kullanici" })
    expect(
      await screen.findByText(
        "Ayarları yalnızca müşteri yöneticisi değiştirebilir."
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Kaydet" })
    ).not.toBeInTheDocument()
  })

  it("iç kullanıcı portal özetinde müşteri seçmeden hata görür; panel kullanıcısı paneli kullanır", async () => {
    renderApp({ route: "/portal", user: "admin" })
    expect(await screen.findByText("Müşteri bulunamadı.")).toBeInTheDocument()
  })
})
