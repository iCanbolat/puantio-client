import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { scenarioLocationId } from "@/mocks/scenarios/phase2"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const TENANT = "temizlik-orta"
const OCTOBER = "2026-10-05T10:00:00+03:00"

function scenarioPerson() {
  const locationId = scenarioLocationId(TENANT)!
  const person = db.personnel
    .findMany(
      (item) =>
        item.tenantId === TENANT &&
        item.homeLocationId === locationId &&
        item.status === "active" &&
        !item.isFloater
    )
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))
    .find(
      (item) =>
        db.personnelDocuments.count((doc) => doc.personnelId === item.id) === 4
    )!
  return { person, name: `${person.firstName} ${person.lastName}` }
}

describe("Batch 6.4 dijital özlük dosyası", () => {
  it("TC-6.4-01 eksik belgeli personel: tamamlanma %50, eksik ve süresi geçmiş belgeler", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("personnel-file-incomplete")
    const { person } = scenarioPerson()
    const { container } = renderApp({
      route: `/personel/${person.id}?sekme=ozluk`,
      user: "ik",
    })
    const bar = await screen.findByRole("progressbar", {
      name: "Özlük dosyası tamamlanma",
    })
    expect(bar).toHaveAttribute("aria-valuenow", "50")
    const list = screen.getByRole("list", { name: "Belgeler" })
    const item = (label: string) => within(list).getByText(label).closest("li")!
    expect(
      within(item("Adli sicil kaydı")).getByText("Süresi geçmiş")
    ).toBeInTheDocument()
    expect(within(item("İş sözleşmesi")).getByText("Eksik")).toBeInTheDocument()
    expect(
      within(item("Kimlik fotokopisi")).getByText("Tamam")
    ).toBeInTheDocument()
    expect(
      within(item("İş sözleşmesi")).getByRole("button", { name: "Yükle" })
    ).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it("bölge sorumlusu yalnızca tamamlanma özetini görür, belge listesi ve yükleme yok", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("personnel-file-incomplete")
    const { person } = scenarioPerson()
    renderApp({ route: `/personel/${person.id}?sekme=ozluk`, user: "bolge" })
    expect(
      await screen.findByText(/yalnızca tamamlanma durumu gösterilir/)
    ).toBeInTheDocument()
    expect(
      screen.getByText("2 eksik · 1 süresi geçmiş belge")
    ).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Belgeler" })).toBeNull()
    expect(
      screen.queryByRole("button", { name: /Yükle|Yeni sürüm/ })
    ).toBeNull()
  })

  it("eksik belge raporu: en eksik dosya üstte, 'eksik belgeli' filtresi URL'de", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("personnel-file-incomplete")
    const { name } = scenarioPerson()
    const { user, container } = renderApp({ route: "/ozluk", user: "ik" })
    const table = await screen.findByRole("table", {
      name: "Özlük dosyası tamamlanma durumu",
    })
    await expectNoA11yViolations(container)
    await user.type(screen.getByLabelText("Personel ara"), name)
    await waitFor(() => {
      expect(within(table).getByText(name)).toBeInTheDocument()
    })
    const row = within(table).getByText(name).closest("tr")!
    expect(within(row).getByText("%50")).toBeInTheDocument()
    expect(
      within(row).getByText(/Süresi geçmiş: Adli sicil kaydı/)
    ).toBeInTheDocument()
  })
})
