import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const TENANT = "temizlik-orta"
const OCTOBER = "2026-10-05T10:00:00+03:00"
const OWN_TEMPLATE = `ats-${TENANT}-firma-ofis`

describe("Batch 4.1–4.2 kalite denetim", () => {
  it("TC-4.1-01 ağırlık toplamı 100 değilse kaydet devre dışı ve açıklama gösterilir; 100 olunca yeni sürüm kaydedilir", async () => {
    const { user, container } = renderApp({
      route: `/kalite/sablonlar/${OWN_TEMPLATE}`,
      user: "supervizor",
    })
    expect(
      await screen.findByRole("heading", {
        name: "Temizlik – Firma ofis standardı",
      })
    ).toBeInTheDocument()
    const status = screen.getByRole("status", { name: "" })
    expect(status).toHaveTextContent("Ağırlık toplamı: 100 / 100")
    await expectNoA11yViolations(container)
    const save = screen.getByRole("button", { name: "Kaydet (yeni sürüm)" })
    const weight = screen.getByLabelText("Madde 1.1 Ağırlık")
    await user.clear(weight)
    await user.type(weight, "10")
    expect(status).toHaveTextContent("Ağırlık toplamı: 95 / 100")
    expect(status).toHaveTextContent("(5 eksik)")
    expect(save).toBeDisabled()
    const second = screen.getByLabelText("Madde 1.2 Ağırlık")
    await user.clear(second)
    await user.type(second, "20")
    expect(status).toHaveTextContent("Ağırlık toplamı: 100 / 100")
    expect(save).toBeEnabled()
    await user.click(save)
    expect(await screen.findByText("Şablon kaydedildi")).toBeInTheDocument()
    await waitFor(() => {
      expect(db.auditTemplates.findById(OWN_TEMPLATE)!.versions).toHaveLength(3)
    })
    expect(await screen.findByText(/Sürüm 3 ·/)).toBeInTheDocument()
  })

  it("madde ekleme/sıralama ve not maddesi: not tipinde ağırlık ve kritik devre dışı", async () => {
    const { user } = renderApp({
      route: `/kalite/sablonlar/${OWN_TEMPLATE}`,
      user: "supervizor",
    })
    await screen.findByRole("heading", {
      name: "Temizlik – Firma ofis standardı",
    })
    const firstSection = screen.getByLabelText("Bölüm 1")
    expect(firstSection).toHaveValue("Islak hacimler")
    await user.click(screen.getByRole("button", { name: "Bölüm 1 aşağı taşı" }))
    expect(screen.getByLabelText("Bölüm 1")).toHaveValue("Ofis ve koridorlar")
    const items = screen.getAllByRole("button", { name: "Madde ekle" })
    await user.click(items[0]!)
    // Yeni madde ağırlığı 0: toplam değişmez, metin boş → kaydetmede alan hatası
    expect(screen.getByLabelText("Madde 1.4")).toHaveValue("")
    await user.click(screen.getByRole("combobox", { name: "Madde 1.4 Tip" }))
    await user.click(
      await screen.findByRole("option", { name: "Not (puansız)" })
    )
    expect(screen.getByLabelText("Madde 1.4 Ağırlık")).toBeDisabled()
    await user.click(
      screen.getByRole("button", { name: "Kaydet (yeni sürüm)" })
    )
    expect(
      await screen.findByText("Madde metni en az 3 karakter")
    ).toBeInTheDocument()
  })

  it("TC-4.1-03 hazır şablon salt okunur; çoğaltılınca düzenlenebilir kopya açılır", async () => {
    const { user, router } = renderApp({
      route: `/kalite/sablonlar/ats-${TENANT}-cleaning-bank`,
      user: "supervizor",
    })
    expect(
      await screen.findByText(
        /Platform kütüphanesindeki hazır şablonlar değiştirilemez/
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Kaydet (yeni sürüm)" })
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText("Şablon adı")).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Çoğalt" }))
    await waitFor(() => {
      expect(router.state.location.pathname).not.toContain("cleaning-bank")
    })
    expect(
      await screen.findByRole("heading", {
        name: "Temizlik – Banka şubesi (kopya)",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Kaydet (yeni sürüm)" })
    ).toBeInTheDocument()
  })

  it("şablon listesi: bölge sorumlusu görür, çoğaltamaz", async () => {
    const { container } = renderApp({
      route: "/kalite/sablonlar",
      user: "bolge",
    })
    expect(
      await screen.findByRole("link", { name: "Temizlik – Banka şubesi" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Yeni şablon" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /şablonunu çoğalt/ })
    ).not.toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it("TC-4.1-02 kritik bulgulu denetim: detayda başarısız işaret, iş emri bağlantısı ve fotoğraflar", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("audit-critical-fail")
    const { container } = renderApp({
      route: `/kalite/denetimler/aud-${TENANT}-kritik`,
      user: "supervizor",
    })
    expect(
      await screen.findByText("Kritik bulgu", { selector: "span" })
    ).toBeInTheDocument()
    const item = screen
      .getByText("Sarf malzemesi (sabun, havlu, kağıt) dolu")
      .closest("li")!
    expect(within(item).getByText("Hayır")).toBeInTheDocument()
    expect(within(item).getByText("Kritik bulgu:")).toBeInTheDocument()
    const link = within(item).getByRole("link", { name: /^İş emri İE-/ })
    expect(link.getAttribute("href")).toMatch(/^\/is-emirleri\/wo-/)
    expect(
      screen.getAllByRole("img", { name: /fotoğrafı/ }).length
    ).toBeGreaterThan(0)
    await expectNoA11yViolations(container)
  })

  it("denetim listesi: kritik filtre ve puan trendi", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("audit-critical-fail")
    const { user, router } = renderApp({ route: "/kalite", user: "supervizor" })
    const table = await screen.findByRole("table", {
      name: "Denetim sonuçları",
    })
    await waitFor(() => {
      expect(within(table).getAllByRole("row").length).toBeGreaterThan(2)
    })
    await user.click(screen.getByRole("combobox", { name: "Sonuç filtresi" }))
    await user.click(
      await screen.findByRole("option", { name: "Kritik bulgulu" })
    )
    await waitFor(() => {
      expect(router.state.location.search).toContain("result=critical")
    })
    await waitFor(() => {
      for (const row of within(table).getAllByRole("row").slice(1))
        expect(row).toHaveTextContent("Kritik bulgu")
    })
    expect(
      await screen.findByRole("region", { name: "Aylık ortalama puan tablosu" })
    ).toBeInTheDocument()
  })

  it("TC-4.2-01 denetim planı: planlanan/gerçekleşen/eksik ve plan ekleme", async () => {
    mockClock.freeze(OCTOBER)
    const { user, container } = renderApp({
      route: "/kalite/plan?ay=2026-09",
      user: "admin",
    })
    const region = await screen.findByRole("region", { name: "Denetim planı" })
    await expectNoA11yViolations(container)
    const rows = within(region).getAllByRole("row").slice(1)
    expect(rows.length).toBeGreaterThan(1)
    expect(screen.getByText("Planlanan").parentElement).toHaveTextContent(/\d+/)
    await user.click(screen.getByRole("button", { name: "Plan ekle" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Denetim planı ekle",
    })
    await user.click(within(dialog).getByRole("button", { name: "Ekle" }))
    expect(
      await within(dialog).findByText("Lokasyon seçin")
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Şablon seçin")).toBeInTheDocument()
    expect(within(dialog).getByText("Denetçi seçin")).toBeInTheDocument()
  })
})
