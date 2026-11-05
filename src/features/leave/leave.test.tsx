import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { scenarioLocationId } from "@/mocks/scenarios/phase2"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"

const TENANT = "temizlik-orta"

function pendingLeave() {
  mockClock.freeze("2026-09-14T09:00:00+03:00")
  const locationId = scenarioLocationId(TENANT)!
  const person = db.personnel
    .findMany(
      (item) =>
        item.tenantId === TENANT &&
        item.homeLocationId === locationId &&
        item.status === "active"
    )
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "tr"))[0]!
  db.leaves.insert({
    id: "lv-tc-2-2-01",
    tenantId: TENANT,
    personnelId: person.id,
    type: "annual",
    startDate: "2026-09-16",
    endDate: "2026-09-17",
    days: 2,
    status: "pending",
    note: "Düğün",
    requestedAt: "2026-09-10T09:00:00+03:00",
    requestedBy: "Hakan Çelik",
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
  })
  return { locationId, person, name: `${person.firstName} ${person.lastName}` }
}

describe("Batch 2.2 izin, rapor ve devamsızlık", () => {
  it("TC-2.2-01 izin onayı: vardiya panosunda ilgili günler 'İzinli'", async () => {
    const { locationId, name } = pendingLeave()
    const { user, router, container } = renderApp({
      route: "/izinler?status=pending",
      user: "bolge",
    })
    const table = await screen.findByRole("table", { name: "İzin listesi" })
    await waitFor(() => {
      expect(within(table).getByText(name)).toBeInTheDocument()
    })
    await expectNoA11yViolations(container)
    await user.click(
      within(table).getByRole("button", { name: `${name} iznini onayla` })
    )
    const dialog = await screen.findByRole("dialog", { name: "İzni onayla" })
    await user.click(within(dialog).getByRole("button", { name: "Onayla" }))
    expect(
      await screen.findByText(/İzin onaylandı; \d+ vardiya plandan kaldırıldı/)
    ).toBeInTheDocument()

    await router.navigate(`/vardiya?lokasyon=${locationId}`)
    await screen.findByRole("table", { name: /vardiya planı/ })
    for (const date of ["16\\.09\\.2026", "17\\.09\\.2026"]) {
      const day = screen.getByRole("button", {
        name: new RegExp(`^${name}, ${date}`),
      })
      expect(day).toHaveTextContent("İzinli")
    }
  })

  it("ret gerekçesi zorunlu; yetkisiz kullanıcıda onay butonu yok", async () => {
    const { name } = pendingLeave()
    const view = renderApp({
      route: "/izinler?status=pending",
      user: "supervizor",
    })
    const table = await screen.findByRole("table", { name: "İzin listesi" })
    await waitFor(() => {
      expect(within(table).getByText(name)).toBeInTheDocument()
    })
    expect(
      within(table).queryByRole("button", { name: /iznini onayla/ })
    ).not.toBeInTheDocument()
    view.unmount()

    const { user } = renderApp({
      route: "/izinler?status=pending",
      user: "bolge",
    })
    const list = await screen.findByRole("table", { name: "İzin listesi" })
    await user.click(
      await within(list).findByRole("button", { name: `${name} iznini reddet` })
    )
    const dialog = await screen.findByRole("dialog", { name: "İzni reddet" })
    await user.click(within(dialog).getByRole("button", { name: "Reddet" }))
    expect(
      within(dialog).getByText("Ret gerekçesini yazın.")
    ).toBeInTheDocument()
    await user.type(
      within(dialog).getByLabelText("Ret gerekçesi"),
      "Yoğun dönem"
    )
    await user.click(within(dialog).getByRole("button", { name: "Reddet" }))
    expect(
      await screen.findByText("İzin talebi reddedildi")
    ).toBeInTheDocument()
    expect(db.leaves.findById("lv-tc-2-2-01")).toMatchObject({
      status: "rejected",
      decisionNote: "Yoğun dönem",
    })
  })

  it("yeni izin formu: zorunlu alanlar, sağlık raporunda açıklama alanı yok (KVKK)", async () => {
    mockClock.freeze("2026-09-14T09:00:00+03:00")
    const { user } = renderApp({ route: "/izinler", user: "bolge" })
    await user.click(await screen.findByRole("button", { name: "Yeni izin" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Yeni izin / rapor kaydı",
    })
    await user.click(
      within(dialog).getByRole("button", { name: "Talep oluştur" })
    )
    expect(
      await within(dialog).findByText("Personel seçin")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText("Başlangıç tarihini seçin")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByLabelText("Açıklama (isteğe bağlı)")
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole("combobox", { name: "Tür" }))
    await user.click(
      await screen.findByRole("option", { name: "Sağlık raporu" })
    )
    expect(
      within(dialog).queryByLabelText("Açıklama (isteğe bağlı)")
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByText(/yalnızca tarih aralığı tutulur/)
    ).toBeInTheDocument()
  })

  it("takvim görünümü ve personel kartı izin sekmesi (bakiye)", async () => {
    const { person } = pendingLeave()
    const view = renderApp({
      route: "/izinler?gorunum=takvim&month=2026-09",
      user: "bolge",
    })
    const calendar = await screen.findByRole("grid", {
      name: "Eylül 2026 izinleri",
    })
    await waitFor(() => {
      expect(
        within(calendar).getByRole("gridcell", {
          name: /^16: [1-9]\d* kişi izinli/,
        })
      ).toBeInTheDocument()
    })
    view.unmount()
    renderApp({ route: `/personel/${person.id}?sekme=izin`, user: "bolge" })
    expect(await screen.findByText("Kalan")).toBeInTheDocument()
    expect(
      await screen.findByRole("list", { name: "İzin geçmişi" })
    ).toHaveTextContent("Onay bekliyor")
  })
})
