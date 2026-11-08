import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { periodId } from "@/mocks/operations/timesheet"
import { shortfallContractId } from "@/mocks/scenarios/phase3"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const TENANT = "temizlik-orta"
const OCTOBER = "2026-10-05T10:00:00+03:00"

async function choose(
  user: ReturnType<typeof renderApp>["user"],
  name: string | RegExp,
  option: string | RegExp
) {
  await user.click(screen.getByRole("combobox", { name }))
  await user.click(await screen.findByRole("option", { name: option }))
}

describe("Batch 3.1 sözleşmeler", () => {
  it("liste: finans yeni sözleşme açabilir, bölge sorumlusu yalnızca görür; a11y", async () => {
    mockClock.freeze(OCTOBER)
    const { container } = renderApp({ route: "/sozlesmeler", user: "finans" })
    const table = await screen.findByRole("table", { name: "Sözleşmeler" })
    await waitFor(() => {
      expect(within(table).getAllByRole("row").length).toBeGreaterThan(2)
    })
    expect(
      screen.getByRole("link", { name: "Yeni sözleşme" })
    ).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it("bölge sorumlusu yeni sözleşme butonunu görmez", async () => {
    mockClock.freeze(OCTOBER)
    renderApp({ route: "/sozlesmeler", user: "bolge" })
    await screen.findByRole("table", { name: "Sözleşmeler" })
    expect(
      screen.queryByRole("link", { name: "Yeni sözleşme" })
    ).not.toBeInTheDocument()
  })

  it("TC-3.1-01 sihirbaz: boş/0 taahhüt form hatası; kamu tipinde İKN zorunlu; kayıt detaya gider", async () => {
    mockClock.freeze(OCTOBER)
    const location = db.locations.findFirst((item) => item.tenantId === TENANT)!
    const customer = db.customers.findById(location.customerId)!
    const { user, container } = renderApp({
      route: "/sozlesmeler/yeni",
      user: "finans",
    })
    await user.type(
      await screen.findByLabelText("Sözleşme adı"),
      "Test hizmet sözleşmesi"
    )
    await user.type(
      screen.getByRole("combobox", { name: "Müşteri" }),
      customer.name.slice(0, 5)
    )
    await user.click(
      await screen.findByRole("option", { name: new RegExp(customer.name) })
    )
    await choose(user, "Yüklenici tüzel kişilik", /Lavanta/)
    await choose(user, "Sözleşme tipi", "Kamu ihalesi")
    fireEvent.change(screen.getByLabelText("Başlangıç"), {
      target: { value: "2026-01-01" },
    })
    fireEvent.change(screen.getByLabelText("Bitiş"), {
      target: { value: "2026-12-31" },
    })
    await user.click(screen.getByRole("button", { name: "İleri" }))
    expect(
      await screen.findByText("Kamu ihalesinde İKN zorunludur")
    ).toBeInTheDocument()
    await user.type(
      screen.getByLabelText("İhale kayıt numarası (İKN)"),
      "2026/481516"
    )
    await user.click(screen.getByRole("button", { name: "İleri" }))

    // Kapsam
    await user.click(await screen.findByRole("button", { name: "İleri" }))
    expect(
      await screen.findByText("En az bir hizmet hattı seçin")
    ).toBeInTheDocument()
    await user.click(screen.getByRole("checkbox", { name: "Temizlik" }))
    await user.click(screen.getByRole("button", { name: "İleri" }))

    // Lokasyonlar
    await user.click(
      await screen.findByRole("checkbox", { name: `${location.name} seç` })
    )
    expect(screen.getByText("1 lokasyon seçildi")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "İleri" }))

    // Taahhüt kadro: hedef kadro önerilir; boş ve 0 hatalı
    const headcount = await screen.findByLabelText(
      `${location.name} Temizlik personeli taahhüt kadro`
    )
    expect(headcount).toHaveValue(location.targetHeadcount)
    await user.clear(headcount)
    await user.click(screen.getByRole("button", { name: "İleri" }))
    expect(await screen.findByText("Taahhüt kadroyu girin")).toBeInTheDocument()
    await user.type(headcount, "0")
    await user.click(screen.getByRole("button", { name: "İleri" }))
    expect(
      await screen.findByText("Taahhüt kadro en az 1 kişi olmalı")
    ).toBeInTheDocument()
    await user.clear(headcount)
    await user.type(headcount, "4")
    await user.click(screen.getByRole("button", { name: "İleri" }))

    // Birim fiyatlar
    await user.click(await screen.findByRole("button", { name: "İleri" }))
    expect(
      await screen.findByText("Birim fiyat girin: Temizlik personeli")
    ).toBeInTheDocument()
    await user.type(
      screen.getByLabelText("Temizlik personeli (kişi/ay)"),
      "42.000,00"
    )
    await user.click(screen.getByRole("button", { name: "İleri" }))

    // Kurallar → özet
    expect(await screen.findByLabelText("KDV oranı")).toHaveValue(20)
    await user.click(screen.getByRole("button", { name: "İleri" }))
    const summary = await screen.findByRole("list", { name: "Taahhüt özeti" })
    expect(summary).toHaveTextContent("4 kişi")
    expect(summary).toHaveTextContent("₺42.000,00/kişi-ay")
    await expectNoA11yViolations(container)
    await user.click(screen.getByRole("button", { name: "Sözleşmeyi kaydet" }))
    expect(
      await screen.findByRole("heading", { name: "Test hizmet sözleşmesi" })
    ).toBeInTheDocument()
    expect(screen.getByText("2026/481516")).toBeInTheDocument()
  })

  it("TC-3.1-02 çakışan yürürlük tarihli zeyilname engellenir; geçerli zeyilname sürüm ekler", async () => {
    mockClock.freeze(OCTOBER)
    const contract = db.contracts.findById(`ct-${TENANT}-1`)!
    const { user } = renderApp({
      route: `/sozlesmeler/${contract.id}`,
      user: "finans",
    })
    await user.click(
      await screen.findByRole("button", { name: "Zeyilname ekle" })
    )
    const dialog = await screen.findByRole("dialog", { name: "Zeyilname ekle" })
    fireEvent.change(within(dialog).getByLabelText("Yürürlük tarihi"), {
      target: { value: contract.versions.at(-1)!.effectiveFrom },
    })
    await user.type(within(dialog).getByLabelText("Açıklama"), "Kadro artışı")
    await user.click(
      within(dialog).getByRole("button", { name: "Zeyilnameyi kaydet" })
    )
    expect(
      await within(dialog).findByText(/ile yürürlük tarihi çakışıyor/)
    ).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText("Yürürlük tarihi"), {
      target: { value: "2026-11-01" },
    })
    await user.click(
      within(dialog).getByRole("button", { name: "Zeyilnameyi kaydet" })
    )
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    expect(
      await screen.findByRole("tab", {
        name: `Sürümler (${contract.versions.length + 1})`,
      })
    ).toBeInTheDocument()
  })

  it("TC-3.1-04 sürüm karşılaştırma fiyat farkını gösterir", async () => {
    mockClock.freeze(OCTOBER)
    const contract = db.contracts.findFirst(
      (item) => item.tenantId === TENANT && item.versions.length > 1
    )!
    const { container } = renderApp({
      route: `/sozlesmeler/${contract.id}?sekme=surumler`,
      user: "finans",
    })
    const table = await screen.findByRole("table", { name: "Sürüm farkları" })
    expect(within(table).getAllByText("Değişti").length).toBeGreaterThan(0)
    expect(table).toHaveTextContent("+%8")
    await expectNoA11yViolations(container)
  })

  it("sözleşme şablonu çoğaltılır ve kopya düzenlenebilir", async () => {
    mockClock.freeze(OCTOBER)
    const { user } = renderApp({
      route: "/ayarlar/sozlesme-sablonlari",
      user: "finans",
    })
    await screen.findByRole("heading", { name: /Kamu ihalesi \(KİK\)/ })
    expect(
      screen.queryByRole("button", { name: "Düzenle" })
    ).not.toBeInTheDocument()
    await user.click(screen.getAllByRole("button", { name: "Çoğalt" })[0]!)
    await user.click(await screen.findByRole("button", { name: "Düzenle" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Şablonu düzenle",
    })
    const vat = within(dialog).getByLabelText("KDV oranı")
    await user.clear(vat)
    await user.type(vat, "45")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await within(dialog).findByText("0–30 arası olmalı")
    ).toBeInTheDocument()
    await user.clear(vat)
    await user.type(vat, "10")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    expect(await screen.findByText("%10")).toBeInTheDocument()
  })

  it("müşteri kartında sözleşmeler listelenir", async () => {
    mockClock.freeze(OCTOBER)
    const contract = db.contracts.findById(`ct-${TENANT}-1`)!
    renderApp({ route: `/musteriler/${contract.customerId}`, user: "admin" })
    const list = await screen.findByRole("list", {
      name: "Müşteri sözleşmeleri",
    })
    expect(list).toHaveTextContent(contract.code)
  })
})

describe("Batch 3.2 kadro raporu", () => {
  it("TC-3.2-01 headcount-shortfall: '120 / 112, −8 (%6,7)'; TC-3.2-02 lokasyona iniş eksik günleri listeler", async () => {
    applyTestScenario("headcount-shortfall")
    mockClock.freeze(OCTOBER)
    const contract = db.contracts.findById(shortfallContractId(TENANT))!
    const locationId = contract.versions[0]!.locations[0]!.locationId
    const person = db.personnel.findFirst(
      (item) => item.homeLocationId === locationId
    )!
    const period = periodId(person.legalEntityId, "2026-09")
    db.timesheetOverrides.insert({
      id: `${period}|${person.id}|2026-09-10`,
      tenantId: TENANT,
      periodId: period,
      personnelId: person.id,
      date: "2026-09-10",
      code: "D",
      overtimeHours: 0,
      by: "Test",
      at: OCTOBER,
    })
    const { user, container } = renderApp({
      route: `/kadro-raporu?sozlesme=${contract.id}&ay=2026-09`,
      user: "finans",
    })
    expect(await screen.findByTestId("headcount-gap")).toHaveTextContent(
      "120 / 112, −8 (%6,7)"
    )
    expect(
      screen.getByText(/taahhüt 120 kişi, fiili 112 kişi/)
    ).toBeInTheDocument()
    await expectNoA11yViolations(container)
    await user.click(
      screen.getByRole("button", {
        name: "Kadro Kampüsü A Blok personel ayrıntısı",
      })
    )
    const list = await screen.findByRole("list", {
      name: "Personel ve eksik günler",
    })
    await waitFor(() => {
      expect(within(list).getAllByRole("listitem")).toHaveLength(46)
    })
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(
      "Eksik 1 gün: 10.09 (D)"
    )
  })

  it("kadro raporu bölge sorumlusuna açık, İK'ya kapalı", async () => {
    mockClock.freeze(OCTOBER)
    renderApp({ route: "/kadro-raporu", user: "ik" })
    expect(
      await screen.findByText("Bu sayfaya erişim yetkiniz yok")
    ).toBeInTheDocument()
  })
})
