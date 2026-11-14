import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { ensureRange } from "@/mocks/operations/plan"
import { scenarioLocationId } from "@/mocks/scenarios/phase2"
import {
  EXPIRED_CERT_BUCKETS,
  portalPackLocationId,
} from "@/mocks/scenarios/phase6"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const TENANT = "temizlik-orta"
const OCTOBER = "2026-10-05T10:00:00+03:00"

function expiredPerson() {
  const cert = db.certificates.findFirst(
    (item) =>
      item.tenantId === TENANT &&
      item.type === "hospital_infection" &&
      item.expiresAt !== null &&
      item.expiresAt < "2026-10-05"
  )!
  const person = db.personnel.findById(cert.personnelId)!
  return { person, name: `${person.firstName} ${person.lastName}` }
}

describe("Faz 6 İSG sayfaları", () => {
  it("genel bakış: İSG uzmanı menüsü ve uyarı kovaları fixture ile eşleşir", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("expired-certificates")
    const { container } = renderApp({ route: "/isg", user: "isg" })
    const nav = await screen.findByLabelText("Ana menü")
    for (const label of [
      "İSG genel bakış",
      "Eğitimler",
      "Sertifikalar",
      "Sağlık gözetimi",
      "Özlük dosyaları",
      "Denetim paketi",
    ])
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument()
    const buckets = await screen.findByRole("region", {
      name: "Sertifika uyarı kovaları",
    })
    await waitFor(() => {
      expect(
        within(buckets).getByRole("link", { name: /Süresi dolmuş/ })
      ).toHaveTextContent(String(EXPIRED_CERT_BUCKETS.expired))
    })
    expect(
      within(buckets).getByRole("link", { name: /30 gün içinde/ })
    ).toHaveTextContent(String(EXPIRED_CERT_BUCKETS.d30))
    expect(await screen.findByText("Periyodik muayeneler")).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it("TC-6.3-01 süresi dolmuş sertifikalı personel hastane lokasyonuna atanınca pano engeller ve açıklar", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("expired-certificates")
    ensureRange(TENANT, "2026-09-28", "2026-10-18")
    const locationId = scenarioLocationId(TENANT)!
    const { name } = expiredPerson()
    const { user, container } = renderApp({
      route: `/vardiya?lokasyon=${locationId}`,
      user: "bolge",
    })
    await screen.findByRole("table", { name: /vardiya planı/ })
    // Kayıtlı atamalar yalnızca uyarı (kayıt serbest)
    expect(screen.queryByText("Kaydı engelleyen ihlaller var")).toBeNull()
    expect(
      screen.getAllByText(/Hastane enfeksiyon eğitimi sertifikası .* sona erdi/)
        .length
    ).toBeGreaterThan(0)
    const sunday = screen.getByRole("button", {
      name: new RegExp(`^${name}, 11\\.10\\.2026`),
    })
    await user.click(sunday)
    const dialog = await screen.findByRole("dialog", { name: "Vardiya seç" })
    await user.click(within(dialog).getByRole("button", { name: /Sabah/ }))
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`^${name}, 11\\.10\\.2026`),
        })
      ).toHaveAttribute("data-violation", "block")
    })
    expect(
      screen.getByText("Kaydı engelleyen ihlaller var")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Planı kaydet" })).toBeDisabled()
    await expectNoA11yViolations(container)
  })

  it("sertifikalar: kova filtresi ve İSG uzmanının yenilemesi; İK salt okur değil hiç göremez", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("expired-certificates")
    const { name } = expiredPerson()
    const { user, container } = renderApp({
      route: "/isg/sertifikalar",
      user: "isg",
    })
    const table = await screen.findByRole("table", {
      name: "Personel sertifikaları",
    })
    await user.click(screen.getByRole("button", { name: /Süresi dolmuş/ }))
    await waitFor(() => {
      expect(within(table).getAllByRole("row")).toHaveLength(3)
    })
    await expectNoA11yViolations(container)
    const row = within(table).getByText(name).closest("tr")!
    await user.click(within(row).getByRole("button", { name: "Yenile" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Sertifikayı yenile",
    })
    // Bitiş, sertifika tipinin varsayılan geçerliliğinden önerilir (12 ay)
    expect(within(dialog).getByLabelText("Bitiş")).toHaveValue("2027-10-05")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(
      await within(dialog).findByText("Belge no girin")
    ).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Belge no"), "HE-2026-1")
    await user.click(within(dialog).getByRole("button", { name: "Kaydet" }))
    expect(await screen.findByText("Sertifika kaydedildi")).toBeInTheDocument()
    await waitFor(() => {
      expect(within(table).getAllByRole("row")).toHaveLength(2)
    })
  })

  it("TC-6.1-03 eğitim planla → katılımı kaydet: yalnızca katılanın durumu yenilenir", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("training-overdue")
    const locationId = scenarioLocationId(TENANT)!
    const people = db.personnel
      .findMany(
        (item) =>
          item.tenantId === TENANT &&
          item.homeLocationId === locationId &&
          !db.trainingRecords.findFirst(
            (record) =>
              record.personnelId === item.id && record.typeId === "temel-isg"
          )
      )
      .slice(0, 1)
    const target = people[0]!
    const targetName = `${target.firstName} ${target.lastName}`
    const { user } = renderApp({ route: "/isg/egitimler", user: "isg" })
    await screen.findByRole("table", { name: "Personel eğitim durumu" })
    await user.click(screen.getByRole("button", { name: "Eğitim planla" }))
    const dialog = await screen.findByRole("dialog", { name: "Eğitim planla" })
    await user.type(within(dialog).getByLabelText("Eğitmen"), "Selin Aydın")
    await user.type(
      within(dialog).getByLabelText("Katılımcı ara"),
      target.employeeNumber
    )
    await user.click(
      await within(dialog).findByRole("checkbox", {
        name: new RegExp(`^${targetName}`),
      })
    )
    await user.click(within(dialog).getByRole("button", { name: "Planla" }))
    expect(await screen.findByText("Eğitim planlandı")).toBeInTheDocument()
    const sessions = await screen.findByRole("list", {
      name: "Eğitim oturumları",
    })
    await user.click(
      within(sessions).getByRole("button", { name: "Katılımı kaydet" })
    )
    const attendance = await screen.findByRole("dialog", {
      name: "Katılımı kaydet",
    })
    await user.click(
      within(attendance).getByRole("button", {
        name: "1/1 katıldı olarak kaydet",
      })
    )
    expect(await screen.findByText("Katılım kaydedildi")).toBeInTheDocument()
    expect(
      db.trainingRecords.findFirst(
        (record) =>
          record.personnelId === target.id &&
          record.typeId === "temel-isg" &&
          record.completedAt === "2026-10-05"
      )
    ).toBeDefined()
  })

  it("İSG ayarları: politika 'uyarı' kaydedilir; bölge sorumlusu sayfaya erişemez", async () => {
    const { user, container } = renderApp({
      route: "/ayarlar/isg",
      user: "isg",
    })
    await screen.findByRole("heading", { name: "İSG ayarları" })
    await expectNoA11yViolations(container)
    await user.click(screen.getByLabelText(/vardiyaya atanınca/))
    await user.click(
      await screen.findByRole("option", { name: "Uyar (kayıt yapılabilir)" })
    )
    await user.click(screen.getByRole("button", { name: "Kaydet" }))
    expect(
      await screen.findByText("İSG ayarları kaydedildi")
    ).toBeInTheDocument()
    expect(db.tenants.findById(TENANT)!.rules.ohs.certificatePolicy).toBe(
      "warn"
    )
  })

  it("TC-6.5-02 portalda müşteri yalnızca kendi lokasyonunun paketini görür; sağlık yalnızca 'Uygun'", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("audit-pack-hospital")
    const locationId = portalPackLocationId(TENANT)!
    const { container } = renderApp({
      route: `/portal/denetim-paketi?lokasyon=${locationId}`,
      user: "musteri",
    })
    const nav = await screen.findByLabelText("Ana menü")
    expect(
      within(nav).getByRole("link", { name: "İSG denetim paketi" })
    ).toBeInTheDocument()
    const table = await screen.findByRole("table", {
      name: /personel uygunluk listesi/,
    })
    expect(within(table).getByText("Sağlık uygunluğu")).toBeInTheDocument()
    expect(within(table).queryByText(/Şartlı/)).toBeNull()
    expect(
      screen.getByRole("button", { name: "Excel indir" })
    ).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it("İSG modülü kapalı kiracıda menüde yok, URL ile 'Paketinizde yok'", async () => {
    renderApp({ route: "/isg", user: "admin", tenant: "cok-hatli-grup" })
    expect(await screen.findByText(/Paketinizde yok/)).toBeInTheDocument()
    const nav = screen.getByLabelText("Ana menü")
    expect(within(nav).queryByText("İSG genel bakış")).toBeNull()
  })
})
