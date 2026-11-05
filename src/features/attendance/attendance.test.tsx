import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { resolveAlarm } from "@/mocks/operations/attendance"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const MONDAY = "2026-09-14"

describe("Batch 2.3 canlı yoklama ve alarm merkezi", () => {
  it("TC-2.3-01 morning-no-show 07:10: 3 alarm, pano 'Gelmedi', sekme başlığında sayaç", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:10:00+03:00`)
    const { user, container } = renderApp({ route: "/yoklama", user: "bolge" })
    await waitFor(() => {
      expect(screen.getByTestId("count-no_show")).toHaveTextContent("3")
    })
    const list = screen.getByRole("list", { name: "Bugünün vardiyaları" })
    expect(within(list).getAllByText("Gelmedi")).toHaveLength(3)
    await waitFor(() => {
      expect(document.title).toMatch(/^\(3\) /)
    })
    await expectNoA11yViolations(container)

    await user.click(screen.getByRole("button", { name: /^Gelmedi/ }))
    await waitFor(() => {
      expect(
        within(
          screen.getByRole("list", { name: "Bugünün vardiyaları" })
        ).getAllByRole("listitem")
      ).toHaveLength(3)
    })
    await user.click(screen.getByRole("link", { name: "Alarm merkezi (3)" }))
    const alarms = await screen.findByRole("list", { name: "Alarmlar" })
    expect(
      within(alarms).getAllByRole("listitem", { name: /alarmı$/ })
    ).toHaveLength(3)
  })

  it("TC-2.3-02 alarm geri sayımı 15:00'ten başlar, 5 dk altında uyarı, süre dolunca aşıldı", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:10:00+03:00`)
    const first = renderApp({ route: "/yoklama/alarmlar", user: "bolge" })
    const timers = await screen.findAllByRole("timer")
    expect(timers[0]).toHaveAttribute("data-state", "ok")
    expect(timers[0]?.textContent).toMatch(/^(15:00|14:5\d)$/)
    first.unmount()

    mockClock.freeze(`${MONDAY}T07:21:00+03:00`)
    const second = renderApp({ route: "/yoklama/alarmlar", user: "bolge" })
    await waitFor(() => {
      expect(screen.getAllByRole("timer")[0]).toHaveAttribute(
        "data-state",
        "warning"
      )
    })
    second.unmount()

    mockClock.freeze(`${MONDAY}T07:26:00+03:00`)
    renderApp({ route: "/yoklama/alarmlar", user: "bolge" })
    await waitFor(() => {
      expect(screen.getAllByRole("timer")[0]).toHaveAttribute(
        "data-state",
        "breached"
      )
    })
  })

  it("TC-2.3-03 yedek ata: öneriler mesafeye göre sıralı, atama sonrası pano günceller; WS ile diğer oturum güncellenir", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:12:00+03:00`)
    const { user, router } = renderApp({
      route: "/yoklama/alarmlar",
      user: "bolge",
    })
    const alarms = await screen.findByRole("list", { name: "Alarmlar" })
    const firstCard = within(alarms).getAllByRole("listitem", {
      name: /alarmı$/,
    })[0]!
    await user.click(
      within(firstCard).getByRole("button", { name: "Yedek ata" })
    )
    const dialog = await screen.findByRole("dialog", { name: "Yedek ata" })
    const options = await within(dialog).findAllByTestId("candidate-distance")
    const distances = options.map((item) =>
      Number(item.textContent.replace(" km", "").replace(",", "."))
    )
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
    await user.click(
      within(dialog).getAllByRole("button", { pressed: false })[0]!
    )
    await user.click(within(dialog).getByRole("button", { name: "Yedeği ata" }))
    expect(await screen.findByText("Yedek personel atandı")).toBeInTheDocument()
    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Alarmlar" })).getAllByRole(
          "listitem",
          { name: /alarmı$/ }
        )
      ).toHaveLength(2)
    })

    // Başka bir kullanıcı (sunucu) alarmı çözer: WS olayı bu oturumu günceller
    const other = db.alarms.findFirst((alarm) => alarm.status !== "resolved")!
    resolveAlarm(
      other,
      { reason: "late_arrival", note: null, backupPersonnelId: null },
      "Murat Demir",
      mockClock.now()
    )
    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Alarmlar" })).getAllByRole(
          "listitem",
          { name: /alarmı$/ }
        )
      ).toHaveLength(1)
    })

    await router.navigate("/yoklama")
    await waitFor(() => {
      expect(screen.getByTestId("count-backup_assigned")).toHaveTextContent("1")
    })
  })

  it("TC-2.3-04 15 dk çözülmeyen alarm: eskalasyon rozeti, operasyon müdürünün listesinde", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:26:00+03:00`)
    renderApp({ route: "/yoklama/alarmlar?durum=eskale", user: "operasyon" })
    const alarms = await screen.findByRole("list", { name: "Alarmlar" })
    expect(
      within(alarms).getAllByText("Eskale: Operasyon müdürü")
    ).toHaveLength(3)
    expect(screen.getByRole("tab", { name: "Eskale (3)" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  it("TC-2.3-05 gerekçesiz kapatma form hatası; not ekleme ve gerekçeyle kapatma", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:12:00+03:00`)
    const { user } = renderApp({
      route: "/yoklama/alarmlar",
      user: "supervizor",
    })
    const alarms = await screen.findByRole("list", { name: "Alarmlar" })
    const card = within(alarms).getAllByRole("listitem", {
      name: /alarmı$/,
    })[0]!
    expect(
      within(card).getByRole("link", { name: "Personeli ara" })
    ).toHaveAttribute("href", expect.stringMatching(/^tel:\+?\d+$/))

    await user.click(within(card).getByRole("button", { name: "Not ekle" }))
    const note = await screen.findByRole("dialog", { name: "Not ekle" })
    await user.type(within(note).getByLabelText("Not"), "Telefonla ulaşılamadı")
    await user.click(within(note).getByRole("button", { name: "Kaydet" }))
    expect(await screen.findByText(/Telefonla ulaşılamadı/)).toBeInTheDocument()

    const refreshed = within(
      screen.getByRole("list", { name: "Alarmlar" })
    ).getAllByRole("listitem", { name: /alarmı$/ })[0]!
    await user.click(within(refreshed).getByRole("button", { name: "Kapat" }))
    const close = await screen.findByRole("dialog", { name: "Alarmı kapat" })
    await user.click(
      within(close).getByRole("button", { name: "Alarmı kapat" })
    )
    expect(
      await within(close).findByText("Kapatma gerekçesi seçin")
    ).toBeInTheDocument()
    await user.click(within(close).getByRole("combobox", { name: "Gerekçe" }))
    await user.click(await screen.findByRole("option", { name: "Diğer" }))
    await user.click(
      within(close).getByRole("button", { name: "Alarmı kapat" })
    )
    expect(await within(close).findByText(/açıklama yazın/)).toBeInTheDocument()
    await user.type(
      within(close).getByLabelText("Açıklama"),
      "Vardiya müşteri talebiyle iptal"
    )
    await user.click(
      within(close).getByRole("button", { name: "Alarmı kapat" })
    )
    expect(await screen.findByText("Alarm kapatıldı")).toBeInTheDocument()
    expect(
      screen.getByRole("tab", { name: "Bugün çözülen (1)" })
    ).toBeInTheDocument()
  })

  it("TC-2.3-06 WebSocket bağlantısı yok: 'Canlı bağlantı yok' rozeti, polling ile veri güncellenir", async () => {
    applyTestScenario("morning-no-show")
    applyTestScenario("realtime-down")
    mockClock.freeze(`${MONDAY}T07:12:00+03:00`)
    renderApp({ route: "/yoklama", user: "bolge" })
    expect(
      await screen.findByText(/Canlı bağlantı yok · 15 sn'de bir yenileniyor/)
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId("count-expected")).not.toHaveTextContent(/^0$/)
    })
  })

  it("check-in detay çekmecesi: cihaz/sunucu zamanı, yöntem, geofence, fotoğraf", async () => {
    applyTestScenario("offline-sync-burst")
    mockClock.freeze(`${MONDAY}T11:00:00+03:00`)
    const { user } = renderApp({ route: "/yoklama", user: "bolge" })
    const list = await screen.findByRole("list", {
      name: "Bugünün vardiyaları",
    })
    const card = await within(list).findAllByText("Geç senkron")
    await user.click(card[0]!.closest("button")!)
    const sheet = await screen.findByRole("dialog")
    expect(
      await within(sheet).findByText("Çevrimdışı kayıt")
    ).toBeInTheDocument()
    expect(within(sheet).getByText("Cihaz zamanı")).toBeInTheDocument()
    expect(within(sheet).getByText("Senkron gecikmesi")).toBeInTheDocument()
    expect(
      within(sheet).getByRole("img", { name: /Giriş fotoğrafı/ })
    ).toHaveAttribute("src", expect.stringContaining("sig="))
  })
})

describe("Batch 2.4 yoklama kayıtları ve düzeltme", () => {
  it("TC-2.4-02 manuel düzeltme: gerekçe zorunlu, önce/sonra farkı, denetim kaydı", async () => {
    applyTestScenario("geofence-violations")
    mockClock.freeze(`${MONDAY}T16:30:00+03:00`)
    const { user, container } = renderApp({
      route: `/yoklama/kayitlar?anomaly=outside_geofence&from=${MONDAY}&to=${MONDAY}`,
      user: "supervizor",
    })
    const table = await screen.findByRole("table", {
      name: "Yoklama kayıtları",
    })
    await waitFor(() => {
      expect(within(table).getAllByText("Geofence dışı")).toHaveLength(3)
    })
    expect(
      within(table).getByText("480 m", { exact: false })
    ).toBeInTheDocument()
    await expectNoA11yViolations(container)

    await user.click(
      within(table).getAllByRole("button", { name: /yoklamasını düzelt/ })[0]!
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Yoklamayı düzelt",
    })
    await user.clear(within(dialog).getByLabelText("Giriş saati"))
    await user.type(within(dialog).getByLabelText("Giriş saati"), "07:00")
    expect(within(dialog).getByTestId("correction-after")).toHaveTextContent(
      /^07:00 – \d\d:\d\d$/
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Düzeltmeyi kaydet" })
    )
    expect(
      await within(dialog).findByText("Gerekçe en az 10 karakter olmalı")
    ).toBeInTheDocument()
    await user.type(
      within(dialog).getByLabelText("Gerekçe"),
      "Telefon GPS hatası, süpervizör teyitli"
    )
    await user.click(
      within(dialog).getByRole("button", { name: "Düzeltmeyi kaydet" })
    )
    expect(
      await screen.findByText("Yoklama düzeltildi; denetim kaydına yazıldı")
    ).toBeInTheDocument()
    const audit = db.auditEvents.findFirst(
      (event) => event.action === "Yoklama düzeltildi"
    )
    expect(audit?.details).toMatch(
      /^Önce: \d\d:\d\d–\d\d:\d\d · Sonra: 07:00–\d\d:\d\d · Gerekçe: Telefon GPS hatası/
    )
    await waitFor(() => {
      expect(within(table).getAllByText("Geofence dışı")).toHaveLength(2)
    })
  })
})

describe("Batch 2.7 Modül 1 dashboard", () => {
  it("ana sayfada katılım, geç kalma, devamsızlık, SLA kartları; modülsüz kiracıda yok", async () => {
    applyTestScenario("morning-no-show")
    mockClock.freeze(`${MONDAY}T07:30:00+03:00`)
    const view = renderApp({ route: "/", user: "operasyon" })
    const section = await screen.findByRole("region", {
      name: "Vardiya ve yoklama",
    })
    await waitFor(() => {
      expect(
        within(section).getByText("Devamsız (bugün)").parentElement
      ).toHaveTextContent("3")
    })
    expect(
      within(section).getByRole("img", { name: "Katılım trendi grafiği" })
    ).toBeInTheDocument()
    view.unmount()
    renderApp({ route: "/", user: "finans" })
    await screen.findByRole("heading", { name: "Operasyon paneli" })
    expect(
      screen.queryByRole("region", { name: "Vardiya ve yoklama" })
    ).not.toBeInTheDocument()
  })
})
