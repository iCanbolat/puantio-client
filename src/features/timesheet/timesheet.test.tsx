import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const PERIOD = "tsp-le-temizlik-orta-1-2026-09"
const REGION = "ou-temizlik-orta-MAR"

async function openGrid() {
  return screen.findByRole("grid", { name: "Puantaj" })
}

describe("Batch 2.5 aylık puantaj", () => {
  it("dönem listesi ve zorunlu bölge filtresi; grid hücreleri kodlarla gelir", async () => {
    applyTestScenario("month-end-close")
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    const { user, container } = renderApp({ route: "/puantaj", user: "bolge" })
    await user.click(
      await screen.findByRole("link", {
        name: "Eylül 2026 Lavanta Temizlik Hizmetleri A.Ş. puantajını aç",
      })
    )
    expect(
      await screen.findByText(/Puantajı görmek için bölge seçin/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole("combobox", { name: "Bölge filtresi" }))
    await user.click(await screen.findByRole("option", { name: "Marmara" }))
    const grid = await openGrid()
    await waitFor(() => {
      expect(within(grid).getAllByRole("row").length).toBeGreaterThan(3)
    })
    expect(
      within(grid).getAllByRole("button", { name: /Normal çalışma/ }).length
    ).toBeGreaterThan(10)
    expect(
      within(grid).getAllByRole("button", { name: /Hafta tatili/ }).length
    ).toBeGreaterThan(3)
    await expectNoA11yViolations(container)
  })

  it("TC-2.5-03 period-locked: grid salt okunur, kilit uyarısı", async () => {
    applyTestScenario("period-locked")
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    renderApp({
      route: `/puantaj/${PERIOD}?orgUnitId=${REGION}`,
      user: "bolge",
    })
    expect(await screen.findByText("Dönem kilitli")).toBeInTheDocument()
    const grid = await openGrid()
    await waitFor(() => {
      expect(within(grid).getAllByRole("button").length).toBeGreaterThan(10)
    })
    expect(
      within(grid)
        .getAllByRole("button")
        .every((button) => button.hasAttribute("disabled"))
    ).toBe(true)
    expect(
      screen.queryByRole("button", { name: "Bölge onayı ver" })
    ).not.toBeInTheDocument()
  })

  it("TC-2.5-04 hr_payroll olmayan kullanıcı: 'İK onayı' butonu yok", async () => {
    applyTestScenario("month-end-close")
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    db.timesheetPeriods.clear()
    const { user } = renderApp({
      route: `/puantaj/${PERIOD}?orgUnitId=${REGION}`,
      user: "bolge",
    })
    await user.click(
      await screen.findByRole("button", { name: "Bölge onayı ver" })
    )
    const confirm = await screen.findByRole("alertdialog")
    await user.click(
      within(confirm).getByRole("button", { name: "Bölge onayı ver" })
    )
    await waitFor(() => {
      expect(screen.getAllByText("Bölge onaylı").length).toBeGreaterThan(0)
    })
    expect(
      screen.queryByRole("button", { name: "İK onayı ver" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("list", { name: "Dönem geçmişi" })
    ).toHaveTextContent("Bölge onayı ver · Elif Kaya")
  })

  it("onay sonrası hücre düzeltmesi fark listesinde; İK onayı ve kilit akışı", async () => {
    applyTestScenario("month-end-close")
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    db.timesheetPeriods.clear()
    const first = renderApp({
      route: `/puantaj/${PERIOD}?orgUnitId=${REGION}`,
      user: "bolge",
    })
    await first.user.click(
      await screen.findByRole("button", { name: "Bölge onayı ver" })
    )
    await first.user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Bölge onayı ver",
      })
    )
    await waitFor(() => {
      expect(screen.getAllByText("Bölge onaylı").length).toBeGreaterThan(0)
    })
    const grid = await openGrid()
    const target = (
      await within(grid).findAllByRole("button", {
        name: /15\b.*|2026-09-15: Normal çalışma/,
      })
    ).find((button) =>
      button.getAttribute("aria-label")?.includes("2026-09-15: Normal çalışma")
    )!
    await first.user.click(target)
    const dialog = await screen.findByRole("dialog", { name: "Puantaj kodu" })
    expect(
      within(dialog).getByText(/fark listesinde görünecek/)
    ).toBeInTheDocument()
    await first.user.click(
      within(dialog).getByRole("combobox", { name: "Kod" })
    )
    await first.user.click(
      await screen.findByRole("option", { name: "FM · Fazla mesai" })
    )
    await first.user.click(
      within(dialog).getByRole("button", { name: "Kaydet" })
    )
    expect(
      await within(dialog).findByText(/Fazla mesai saatini girin/)
    ).toBeInTheDocument()
    await first.user.type(
      within(dialog).getByLabelText("Fazla mesai (saat)"),
      "2,5"
    )
    await first.user.click(
      within(dialog).getByRole("button", { name: "Kaydet" })
    )
    expect(
      await screen.findByRole("list", { name: "Fark listesi" })
    ).toHaveTextContent(/N → FM/)
    first.unmount()

    const hr = renderApp({
      route: `/puantaj/${PERIOD}?orgUnitId=${REGION}`,
      user: "ik",
    })
    await hr.user.click(
      await screen.findByRole("button", { name: "İK onayı ver" })
    )
    await hr.user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "İK onayı ver",
      })
    )
    await hr.user.click(
      await screen.findByRole("button", { name: "Dönemi kilitle" })
    )
    await hr.user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Dönemi kilitle",
      })
    )
    expect(await screen.findByText("Dönem kilitli")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Bordroya aktar" })
    ).toHaveAttribute("href", `/bordro?donem=${PERIOD}`)
  })

  it("TC-2.5-06 personel temini dönemi 'Müşteri onayı' adımında bekler; portalda onay butonu görünür", async () => {
    applyTestScenario("month-end-close")
    mockClock.freeze("2026-10-02T10:00:00+03:00")
    db.timesheetPeriods.clear()
    const customerId = (
      db.users.findById("u-temizlik-orta-musteri")!.scope as { ids: string[] }
    ).ids[0]!
    const location = db.locations.findFirst(
      (item) => item.customerId === customerId
    )!
    db.locations.update(location.id, { serviceLines: ["staffing"] })
    const person = db.personnel.findFirst(
      (item) => item.tenantId === "temizlik-orta" && item.status === "active"
    )!
    db.personnel.update(person.id, { homeLocationId: location.id })

    const region = renderApp({
      route: `/puantaj/${PERIOD}?orgUnitId=${REGION}`,
      user: "bolge",
    })
    expect(
      await screen.findByRole("list", { name: "Dönem adımları" })
    ).toHaveTextContent("Müşteri onayı")
    await region.user.click(
      screen.getByRole("button", { name: "Bölge onayı ver" })
    )
    await region.user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Bölge onayı ver",
      })
    )
    expect(
      await screen.findByText("Müşteri onayı bekleniyor")
    ).toBeInTheDocument()
    region.unmount()

    const portal = renderApp({
      route: "/portal/puantaj-onaylari",
      user: "musteri",
    })
    const list = await screen.findByRole("list", {
      name: "Onay bekleyen dönemler",
    })
    await portal.user.click(
      within(list).getByRole("button", { name: "Onayla" })
    )
    expect(
      await screen.findByText("Onay bekleyen puantaj yok")
    ).toBeInTheDocument()
    portal.unmount()

    renderApp({ route: `/puantaj/${PERIOD}?orgUnitId=${REGION}`, user: "ik" })
    expect(
      await screen.findByRole("button", { name: "İK onayı ver" })
    ).toBeInTheDocument()
    expect(screen.getAllByText("Müşteri onaylı").length).toBeGreaterThan(0)
  })

  it("personel kartı puantaj sekmesi son dönemin günlük kodlarını gösterir", async () => {
    mockClock.freeze("2026-09-20T10:00:00+03:00")
    const person = db.personnel.findFirst(
      (item) =>
        item.tenantId === "temizlik-orta" &&
        item.status === "active" &&
        item.homeLocationId !== null
    )!
    renderApp({ route: `/personel/${person.id}?sekme=puantaj`, user: "ik" })
    const days = await screen.findByRole("list", {
      name: "Günlük puantaj kodları",
    })
    expect(within(days).getAllByRole("listitem")).toHaveLength(30)
    expect(screen.getByText(/Çalışılan \d+/)).toBeInTheDocument()
  })
})
