import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const PERIOD = "tsp-le-temizlik-orta-1-2026-09"

function approvedPeriod() {
  applyTestScenario("month-end-close")
  mockClock.freeze("2026-10-02T10:00:00+03:00")
  db.timesheetPeriods.clear()
  // Dönemi doğrudan İK onaylı başlat (onay akışı timesheet testlerinde)
  db.timesheetPeriods.insert({
    id: PERIOD,
    tenantId: "temizlik-orta",
    legalEntityId: "le-temizlik-orta-1",
    month: "2026-09",
    status: "hr_approved",
    customerApprovalRequired: false,
    history: [],
    changes: [],
  })
}

describe("Batch 2.6 bordro aktarımı", () => {
  it("TC-2.6-03 gün toplamı tutmayan personel: önizlemede kırmızı satır, 'Dışa aktar' devre dışı", async () => {
    approvedPeriod()
    const person = db.personnel.findFirst(
      (item) => item.tenantId === "temizlik-orta" && item.status === "active"
    )!
    db.timesheetOverrides.insert({
      id: `${PERIOD}|${person.id}|2026-09-15`,
      tenantId: "temizlik-orta",
      periodId: PERIOD,
      personnelId: person.id,
      date: "2026-09-15",
      code: "Dİ",
      overtimeHours: 0,
      by: "Test",
      at: "2026-10-01T10:00:00+03:00",
    })
    // Kopya profilden "İstirahat (Rapor)" kolonundaki Dİ kodu çıkarılır → gün toplamı 29
    const logo = db.payrollProfiles.findById("pp-temizlik-orta-logo")!
    db.payrollProfiles.insert({
      ...logo,
      id: "pp-test-eksik",
      name: "Eksik eşleme",
      libraryKey: null,
      columns: (
        logo.columns as {
          header: string
          source: { kind: string; codes?: string[] }
        }[]
      ).map((column) =>
        column.header === "İstirahat (Rapor)"
          ? { ...column, source: { kind: "days", codes: ["R"] } }
          : column
      ),
    })
    const { container } = renderApp({
      route: `/bordro?donem=${PERIOD}&profil=pp-test-eksik`,
      user: "ik",
    })
    expect(
      await screen.findByText("1 satırda hata var; dışa aktarım engellendi")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Dışa aktar" })).toBeDisabled()
    expect(
      screen.getByText(/Gün toplamı 29; dönemde 30 gün olmalı/)
    ).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it("Logo profiliyle dışa aktarım dosyayı indirir ve geçmişe yazar", async () => {
    approvedPeriod()
    let captured: Blob | null = null
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          captured = blob
          return "blob:payroll"
        }),
        revokeObjectURL: vi.fn(),
      })
    )
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined
    )
    const { user } = renderApp({ route: `/bordro?donem=${PERIOD}`, user: "ik" })
    const exportButton = await screen.findByRole("button", {
      name: "Dışa aktar",
    })
    await waitFor(() => {
      expect(exportButton).toBeEnabled()
    })
    expect(
      screen.getByRole("columnheader", { name: "Çalışılan Gün" })
    ).toBeInTheDocument()
    await user.click(exportButton)
    expect(
      await screen.findByText(/puantaj-lavanta-2026-09\.xlsx indirildi/)
    ).toBeInTheDocument()
    expect(captured).not.toBeNull()
    expect(
      await screen.findByRole("button", {
        name: "puantaj-lavanta-2026-09.xlsx dosyasını indir",
      })
    ).toBeInTheDocument()
  })

  it("TC-2.6-05 hazır profil çoğaltılır, kod eşlemesi düzenlenir, varsayılan atanır", async () => {
    approvedPeriod()
    const { user } = renderApp({ route: "/bordro/profiller", user: "ik" })
    const list = await screen.findByRole("list", { name: "Profiller" })
    const generic = within(list).getByText("Genel CSV").closest("li")!
    expect(within(list).getAllByText("Hazır profil")).toHaveLength(2)
    expect(
      within(generic).queryByRole("button", { name: /düzenle/ })
    ).not.toBeInTheDocument()
    await user.click(within(generic).getByRole("button", { name: "Çoğalt" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Aktarım profilini düzenle",
    })
    await user.clear(within(dialog).getByLabelText("Profil adı"))
    await user.type(within(dialog).getByLabelText("Profil adı"), "Mikro günlük")
    await user.type(within(dialog).getByLabelText(/^D → bordro kodu/), "DEV")
    await user.click(
      within(dialog).getByRole("button", { name: "Profili kaydet" })
    )
    expect(await screen.findByText("Profil kaydedildi")).toBeInTheDocument()
    const saved = db.payrollProfiles.findFirst(
      (item) => item.name === "Mikro günlük"
    )!
    expect(saved.codeMap).toEqual({ D: "DEV" })

    await user.click(
      screen.getByRole("combobox", {
        name: "Lavanta Temizlik Hizmetleri A.Ş. varsayılan profili",
      })
    )
    await user.click(
      await screen.findByRole("option", { name: "Mikro günlük" })
    )
    expect(
      await screen.findByText("Varsayılan profil güncellendi")
    ).toBeInTheDocument()
    expect(
      db.legalEntities.findById("le-temizlik-orta-1")?.payrollProfileId
    ).toBe(saved.id)
  })
})
