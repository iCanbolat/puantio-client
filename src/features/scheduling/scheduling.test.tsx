import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { buildAssignment, ensureRange } from "@/mocks/operations/plan"
import {
  addAssignment,
  bumpLocationVersion,
  ops,
} from "@/mocks/operations/store"
import { scenarioLocationId } from "@/mocks/scenarios/phase2"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"

const TENANT = "temizlik-orta"
const MONDAY = "2026-09-14"

function setup() {
  mockClock.freeze(`${MONDAY}T09:00:00+03:00`)
  const locationId = scenarioLocationId(TENANT)!
  ensureRange(TENANT, "2026-09-07", "2026-09-27")
  const person = db.personnel
    .findMany(
      (item) =>
        item.tenantId === TENANT &&
        item.homeLocationId === locationId &&
        item.status === "active"
    )
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "tr"))[0]!
  return { locationId, person, name: `${person.firstName} ${person.lastName}` }
}

const cell = (name: string, date: string) =>
  screen.getByRole("button", {
    name: new RegExp(`^${name}, ${date.split("-").reverse().join("\\.")}`),
  })

async function chooseTemplate(
  user: ReturnType<typeof renderApp>["user"],
  code: RegExp
) {
  const dialog = await screen.findByRole("dialog", { name: "Vardiya seç" })
  await user.click(within(dialog).getByRole("button", { name: code }))
  await waitFor(() => {
    expect(
      screen.queryByRole("dialog", { name: "Vardiya seç" })
    ).not.toBeInTheDocument()
  })
}

describe("Batch 2.1 vardiya planlama panosu", () => {
  it("lokasyon seçilmeden boş durum; yalnız okuma yetkisinde pano düzenlenemez", async () => {
    const { locationId } = setup()
    const view = renderApp({ route: "/vardiya", user: "supervizor" })
    expect(
      await screen.findByText(/Plan için bir lokasyon seçin/)
    ).toBeInTheDocument()
    view.unmount()
    const supervised = (
      db.users.findById("u-temizlik-orta-supervizor")!.scope as {
        ids: string[]
      }
    ).ids
    expect(supervised).toContain(locationId)
    renderApp({ route: `/vardiya?lokasyon=${locationId}`, user: "supervizor" })
    await screen.findByRole("table", { name: /vardiya planı/ })
    expect(
      screen.queryByRole("button", { name: "Planı kaydet" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /sürükle/ })
    ).not.toBeInTheDocument()
  })

  it("TC-2.1-01 başka lokasyondaki vardiyayla çakışan atama: uyarı, kaydet engellenir", async () => {
    const { locationId, person, name } = setup()
    const other = db.locations.findFirst(
      (item) => item.tenantId === TENANT && item.id !== locationId
    )!
    const template = db.shiftTemplates.findById("tpl-temizlik-orta-sabah")!
    addAssignment(
      buildAssignment({
        id: "sh-test-other",
        tenantId: TENANT,
        personnelId: person.id,
        locationId: other.id,
        date: "2026-09-20",
        template,
      })
    )
    ops.events.set("sh-test-other", [])
    const { user, container } = renderApp({
      route: `/vardiya?lokasyon=${locationId}`,
      user: "bolge",
    })
    await screen.findByRole("table", { name: /vardiya planı/ })
    await user.click(cell(name, "2026-09-20"))
    await chooseTemplate(user, /Sabah/)
    await waitFor(() => {
      expect(cell(name, "2026-09-20")).toHaveAttribute(
        "data-violation",
        "block"
      )
    })
    expect(
      screen.getByText("Kaydı engelleyen ihlaller var")
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Çakışan vardiya/).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Planı kaydet" })).toBeDisabled()
    await expectNoA11yViolations(container)
  })

  it("TC-2.1-02 haftalık 45 saati aşan atama uyarı rozeti + açıklama, kayıt serbest", async () => {
    const { locationId, person, name } = setup()
    const { user } = renderApp({
      route: `/vardiya?lokasyon=${locationId}`,
      user: "bolge",
    })
    await screen.findByRole("table", { name: /vardiya planı/ })
    const planned = ops.byDate
      .get(TENANT)
      ?.get(MONDAY)
      ?.find((item) => item.personnelId === person.id)
    expect(planned).toBeDefined()
    // Pazar da çalıştırılır: 6 × 7,5 + 7,5 = 52,5 saat
    await user.click(cell(name, "2026-09-20"))
    await chooseTemplate(user, /Sabah/)
    await waitFor(() => {
      expect(cell(name, "2026-09-20")).toHaveAttribute("data-violation", "warn")
    })
    expect(cell(name, "2026-09-20").getAttribute("aria-label")).toMatch(
      /haftalık 45 saati 7,5 saat aşıyor/
    )
    expect(screen.getByRole("button", { name: "Planı kaydet" })).toBeEnabled()
  })

  it("TC-2.1-03 23:00 bitişli vardiya sonrası 07:00 vardiyası: 11 saat dinlenme ihlali", async () => {
    const { locationId, name } = setup()
    const { user } = renderApp({
      route: `/vardiya?lokasyon=${locationId}`,
      user: "bolge",
    })
    await screen.findByRole("table", { name: /vardiya planı/ })
    await user.click(cell(name, "2026-09-15"))
    await chooseTemplate(user, /Akşam/)
    await user.click(cell(name, "2026-09-16"))
    await chooseTemplate(user, /Sabah/)
    await waitFor(() => {
      expect(cell(name, "2026-09-16").getAttribute("aria-label")).toMatch(
        /Dinlenme süresi 8 saat/
      )
    })
  })

  it("TC-2.1-04 onaylı izinli kişiye atama engellenir; gün 'İzinli' görünür", async () => {
    const { locationId, person, name } = setup()
    ops.weeks.clear()
    ops.byDate.clear()
    ops.byId.clear()
    db.leaves.insert({
      id: "lv-tc-2-1-04",
      tenantId: TENANT,
      personnelId: person.id,
      type: "annual",
      startDate: "2026-09-16",
      endDate: "2026-09-16",
      days: 1,
      status: "approved",
      note: null,
      requestedAt: "2026-09-01T09:00:00+03:00",
      requestedBy: "Test",
      decidedAt: "2026-09-02T09:00:00+03:00",
      decidedBy: "Test",
      decisionNote: null,
    })
    const { user } = renderApp({
      route: `/vardiya?lokasyon=${locationId}`,
      user: "bolge",
    })
    await screen.findByRole("table", { name: /vardiya planı/ })
    expect(cell(name, "2026-09-16")).toHaveTextContent("İzinli")
    await user.click(cell(name, "2026-09-16"))
    const dialog = await screen.findByRole("dialog", { name: "Vardiya seç" })
    expect(
      within(dialog).getByText(/onaylı izin günü, vardiya atanamaz/)
    ).toBeInTheDocument()
    await chooseTemplate(user, /Sabah/)
    await waitFor(() => {
      expect(cell(name, "2026-09-16")).toHaveAttribute(
        "data-violation",
        "block"
      )
    })
    expect(screen.getByRole("button", { name: "Planı kaydet" })).toBeDisabled()
  })

  it("TC-2.1-05 kayıt sırasında başkası değiştirdi (409): çakışma diyaloğu, üzerine yaz", async () => {
    const { locationId, person, name } = setup()
    const { user } = renderApp({
      route: `/vardiya?lokasyon=${locationId}`,
      user: "bolge",
    })
    await screen.findByRole("table", { name: /vardiya planı/ })
    await user.click(cell(name, "2026-09-15"))
    await chooseTemplate(user, /Akşam/)
    expect(screen.getByText("1 kaydedilmemiş değişiklik")).toBeInTheDocument()
    bumpLocationVersion(TENANT, locationId)
    await user.click(screen.getByRole("button", { name: "Planı kaydet" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "Plan başka biri tarafından değiştirildi",
    })
    expect(
      within(dialog).getByRole("button", { name: "Güncel planı yükle" })
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole("button", { name: "Üzerine yaz" })
    )
    expect(
      await screen.findByText("Plan kaydedildi (1 değişiklik)")
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText("Taslak yok")).toBeInTheDocument()
    })
    const saved = ops.byDate
      .get(TENANT)
      ?.get("2026-09-15")
      ?.find(
        (item) =>
          item.personnelId === person.id && item.locationId === locationId
      )
    expect(saved?.code).toBe("A")
    expect(
      db.auditEvents.findFirst(
        (event) => event.action === "Vardiya planı kaydedildi"
      )?.details
    ).toBe("1 değişiklik (üzerine yazıldı)")
  })

  it("409 sonrası güncel plan yüklenir, taslak korunur; önceki haftayı kopyala ve toplu rotasyon", async () => {
    const { locationId, name } = setup()
    const { user } = renderApp({
      route: `/vardiya?lokasyon=${locationId}&tarih=2026-09-21`,
      user: "bolge",
    })
    await screen.findByRole("table", { name: /vardiya planı/ })
    await user.click(
      screen.getByRole("button", { name: "Önceki haftayı kopyala" })
    )
    expect(
      await screen.findByText(/kaydedilmemiş değişiklik/)
    ).toBeInTheDocument()
    bumpLocationVersion(TENANT, locationId)
    await user.click(screen.getByRole("button", { name: "Planı kaydet" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Güncel planı yükle" })
    )
    expect(
      await screen.findByText("Güncel plan yüklendi; taslağınız korunuyor")
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Planı kaydet" }))
    expect(await screen.findByText(/Plan kaydedildi/)).toBeInTheDocument()

    await user.click(
      screen.getByRole("checkbox", { name: `${name} satırını seç` })
    )
    await user.click(screen.getByRole("button", { name: "Toplu atama (1)" }))
    const bulk = await screen.findByRole("dialog", { name: "Toplu atama" })
    await user.click(within(bulk).getByRole("combobox", { name: "Şablon" }))
    await user.click(await screen.findByRole("option", { name: /R6/ }))
    await user.click(
      within(bulk).getByRole("button", { name: "Taslağa uygula" })
    )
    await waitFor(() => {
      expect(cell(name, "2026-09-21")).toHaveTextContent("G12")
    })
    expect(cell(name, "2026-09-25")).not.toHaveTextContent(/G/)
  })

  it("şablonlar sayfası: yeni parçalı şablon, kod çakışması, lokasyon kuralı", async () => {
    const { user } = renderApp({ route: "/vardiya/sablonlar", user: "bolge" })
    await screen.findByRole("list", { name: "Şablon listesi" })
    await user.click(screen.getByRole("button", { name: "Yeni şablon" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Yeni vardiya şablonu",
    })
    await user.type(within(dialog).getByLabelText("Kısa kod"), "S")
    await user.type(within(dialog).getByLabelText("Ad"), "Kısa sabah")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await within(dialog).findByText(
        "Bu kısa kod başka bir şablonda kullanılıyor."
      )
    ).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText("Kısa kod"))
    await user.type(within(dialog).getByLabelText("Kısa kod"), "KS")
    expect(
      within(dialog).getByText("Net çalışma: 7,5 saat")
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(await screen.findByText("Şablon eklendi")).toBeInTheDocument()
    expect(
      db.shiftTemplates.findFirst(
        (item) => item.code === "KS" && item.tenantId === TENANT
      )
    ).toBeTruthy()
  })
})
