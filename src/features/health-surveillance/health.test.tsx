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
        item.status === "active"
    )
    .find((item) =>
      db.healthRecords.findFirst((record) => record.personnelId === item.id)
    )!
  return { person, name: `${person.firstName} ${person.lastName}` }
}

/** Önbellekte (sorgu veya mutasyon) açık sağlık verisi kalmamalı */
function cacheText(queryClient: ReturnType<typeof renderApp>["queryClient"]) {
  return JSON.stringify([
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.state.data),
    queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.state.data),
  ])
}

describe("Batch 6.2 sağlık gözetimi", () => {
  it("TC-6.2-01 İSG uzmanı olmayan kullanıcıda sağlık sekmesi ve verisi DOM'da yok; URL ile 403", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("health-due")
    const { person } = scenarioPerson()
    renderApp({ route: `/personel/${person.id}?sekme=saglik`, user: "ik" })
    const tabs = await screen.findByRole("tablist")
    expect(within(tabs).getByRole("tab", { name: "Özlük" })).toBeInTheDocument()
    expect(within(tabs).queryByRole("tab", { name: "Sağlık" })).toBeNull()
    // İK'nın İSG okuma yetkisi de yok
    expect(within(tabs).queryByRole("tab", { name: "İSG" })).toBeNull()
    // Gizli sekmeye URL ile gelinse de genel sekme açılır; sağlık metni hiç yok
    expect(within(tabs).getByRole("tab", { name: "Genel" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.queryByText(/Sağlık gözetimi|muayene/i)).toBeNull()
    const nav = screen.getByLabelText("Ana menü")
    expect(
      within(nav).queryByRole("link", { name: "Sağlık gözetimi" })
    ).toBeNull()
  })

  it("TC-6.2-01 İK sağlık listesine URL ile gidince yetkisiz sayfası", async () => {
    renderApp({ route: "/isg/saglik", user: "ik" })
    expect(
      await screen.findByText("Bu sayfaya erişim yetkiniz yok")
    ).toBeInTheDocument()
  })

  it("TC-6.2-02 'Göster' gerekçe ister, erişim kaydına yazılır, veri önbelleğe girmez", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("health-due")
    const { person, name } = scenarioPerson()
    const record = db.healthRecords.findFirst(
      (item) => item.personnelId === person.id
    )!
    const { user, container, queryClient } = renderApp({
      route: `/personel/${person.id}?sekme=saglik`,
      user: "isg",
    })
    const reveal = await screen.findByRole("button", { name: "Göster" })
    expect(
      screen.getByText("Muayene sonucu ve tarihler maskeli.")
    ).toBeInTheDocument()
    await expectNoA11yViolations(container)
    await user.click(reveal)
    const dialog = await screen.findByRole("dialog", {
      name: "Sağlık verisini göster",
    })
    await user.click(within(dialog).getByRole("button", { name: "Göster" }))
    expect(
      within(dialog).getByText("Gerekçe en az 10 karakter olmalı")
    ).toBeInTheDocument()
    expect(db.healthAccessLogs.count()).toBe(0)
    await user.type(
      within(dialog).getByLabelText("Gerekçe"),
      "Periyodik muayene planlaması"
    )
    await user.click(within(dialog).getByRole("button", { name: "Göster" }))
    const details = await screen.findByLabelText("Sağlık kaydı")
    const nextExam = record.nextExamAt.split("-").reverse().join(".")
    expect(within(details).getByText(nextExam)).toBeInTheDocument()
    expect(db.healthAccessLogs.findMany()).toEqual([
      expect.objectContaining({
        personnelId: person.id,
        action: "reveal",
        reason: "Periyodik muayene planlaması",
      }),
    ])
    expect(cacheText(queryClient)).not.toContain(record.nextExamAt)
    expect(window.location.search).not.toContain(record.nextExamAt)
    await user.click(screen.getByRole("button", { name: "Maskele" }))
    expect(screen.queryByLabelText("Sağlık kaydı")).toBeNull()
    expect(screen.queryByText(name)).toBeInTheDocument()
  })

  it("TC-6.2-03 maskeli liste → göster → güncelle; erişim kayıtlarında gerekçeyle görünür", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("health-due")
    const { name } = scenarioPerson()
    const { user, container, queryClient } = renderApp({
      route: "/isg/saglik?due=overdue",
      user: "isg",
    })
    const table = await screen.findByRole("table", {
      name: "Periyodik muayene durumu (maskeli)",
    })
    await expectNoA11yViolations(container)
    expect(within(table).queryByText(/Uygun/)).toBeNull()
    const rows = within(table).getAllByRole("row").slice(1)
    const first = rows[0]!
    await user.click(
      within(first).getByRole("button", { name: /sağlık kaydını göster/ })
    )
    const dialog = await screen.findByRole("dialog")
    await user.type(
      within(dialog).getByLabelText("Gerekçe"),
      "İşe dönüş kontrolü"
    )
    await user.click(within(dialog).getByRole("button", { name: "Göster" }))
    await user.click(
      await within(dialog).findByRole("button", {
        name: /Muayene kaydını (güncelle|ekle)/,
      })
    )
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText("Muayene kaydı güncellendi")
    ).toBeInTheDocument()
    expect(cacheText(queryClient)).not.toMatch(/examinedAt|nextExamAt/)
    await user.click(screen.getByRole("button", { name: "Kapat ve maskele" }))
    await user.click(screen.getByRole("link", { name: "Erişim kayıtları" }))
    const logs = await screen.findByRole("table", {
      name: "Sağlık verisi erişim kayıtları",
    })
    await waitFor(() => {
      expect(within(logs).getByText("İşe dönüş kontrolü")).toBeInTheDocument()
    })
    expect(within(logs).getAllByText("Selin Aydın").length).toBeGreaterThan(0)
    expect(within(logs).getByText("Güncelleme")).toBeInTheDocument()
    expect(name).toBeTruthy()
  })
})
