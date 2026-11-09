import type { Page } from "@playwright/test"

import { expect, navigateViaMenu, test } from "./fixtures"

const OCTOBER = "2026-10-05T10:00:00+03:00"
const TOKEN = "WC-TEMIZLIK-ORTA"
const CUSTOMER_EMAIL = "kerem.ozturk@lavanta.example"
// 1×1 PNG (fotoğraf yükleme)
const PNG = {
  name: "foto.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  ),
}

/**
 * Mock veritabanı tarayıcı belleğindedir; tam sayfa yüklemesi yeniden tohumlar. Akış boyunca
 * veri korunsun diye sayfalar arasında istemci tarafı yönlendirme yapılır.
 */
async function clientNavigate(page: Page, path: string) {
  await page.evaluate((target) => {
    window.history.pushState(null, "", target)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }, path)
}

test.describe("Faz 4: kalite denetim, QR bildirim, iş emirleri ve müşteri portalı", () => {
  test("E2E-4.1 QR bildirimi → panelde iş emri → atama → fotoğraflı tamamlama → müşteri portalında görünür (TC-4.3-01, TC-4.4-03)", async ({
    page,
    gotoApp,
    isMobile,
  }) => {
    test.slow()
    await gotoApp("/is-emirleri", {
      senaryo: "quality-demo",
      saat: OCTOBER,
      kullanici: "supervizor",
    })
    await expect(
      page.getByRole("heading", { name: "İş emirleri" })
    ).toBeVisible()

    // 1) Ziyaretçi QR kodu okutur (oturum gerektirmeyen sayfa)
    await clientNavigate(page, `/q/${TOKEN}`)
    await expect(
      page.getByRole("heading", { name: "Zemin kat WC" })
    ).toBeVisible()
    await page.getByRole("button", { name: "Sabun yok" }).click()
    await page.getByLabel("Not (isteğe bağlı)").fill("Sol lavabo")
    await page.getByLabel("Fotoğraf ekle (isteğe bağlı)").setInputFiles(PNG)
    await expect(page.getByText("Seçilen: foto.png")).toBeVisible()
    await page.getByRole("button", { name: "Bildir" }).click()
    await expect(
      page.getByRole("heading", { name: "Teşekkürler!" })
    ).toBeVisible()
    const receipt = await page.getByText(/Kayıt no:/).textContent()
    const reference = /İE-\d{4}-\d{5}/.exec(receipt ?? "")?.[0] ?? ""
    expect(reference).not.toBe("")

    // 2) Süpervizör panelde iş emrini görür ve yönetir
    await clientNavigate(page, "/is-emirleri")
    // Liste önbellekten gelebilir (realtime olayı QR sayfasındayken geldi); aramak tazeler
    await page
      .getByRole("searchbox", { name: "İş emirlerinde ara" })
      .fill(reference)
    await page.getByRole("link", { name: "Sabun yok · Zemin kat WC" }).click()
    await expect(
      page.getByRole("heading", { name: "Sabun yok · Zemin kat WC" })
    ).toBeVisible()
    await expect(page.getByText(reference)).toBeVisible()
    await expect(
      page.getByRole("img", { name: "Sabun yok bildirim fotoğrafı" })
    ).toBeVisible()

    await page.getByRole("button", { name: "Ata", exact: true }).click()
    const assign = page.getByRole("dialog", { name: "Ata" })
    await assign.getByRole("combobox", { name: "Atanacak personel" }).click()
    await page.getByRole("option").first().click()
    await assign.getByRole("button", { name: "Ata", exact: true }).click()
    await expect(assign).toBeHidden()

    await page.getByRole("button", { name: "Müdahaleye başla" }).click()
    const start = page.getByRole("dialog", { name: "Müdahaleye başla" })
    await start.getByRole("button", { name: "Müdahaleye başla" }).click()
    await expect(start).toBeHidden()

    await page.getByRole("button", { name: "Tamamla", exact: true }).click()
    const complete = page.getByRole("dialog", { name: "Tamamla" })
    await complete.getByRole("button", { name: "Tamamla", exact: true }).click()
    await expect(complete.getByRole("alert")).toBeVisible()
    await complete.locator('input[type="file"]').setInputFiles(PNG)
    await complete.getByLabel("Not (isteğe bağlı)").fill("Sabun dolduruldu")
    await complete.getByRole("button", { name: "Tamamla", exact: true }).click()
    await expect(complete).toBeHidden()
    await expect(
      page.getByRole("img", { name: "Tamamlanma fotoğrafı" })
    ).toBeVisible()
    await expect(page.getByText("Sabun dolduruldu").first()).toBeVisible()

    // 3) Müşteri portala girer (aynı sayfa oturumunda e-postayla giriş)
    await page.getByRole("button", { name: /^Kullanıcı menüsü/ }).click()
    await page.getByRole("menuitem", { name: "Çıkış yap" }).click()
    await page.getByLabel("E-posta adresi").fill(CUSTOMER_EMAIL)
    await page.getByRole("button", { name: "E-posta ile giriş yap" }).click()
    await expect(page).toHaveURL(/\/portal$/)
    await navigateViaMenu(page, isMobile, "İş emirleri")
    await page
      .getByRole("searchbox", { name: "İş emirlerinde ara" })
      .fill(reference)
    await page.getByRole("link", { name: "Sabun yok · Zemin kat WC" }).click()
    await expect(page).toHaveURL(/\/portal\/is-emirleri\/wo-/)
    await expect(
      page.getByRole("heading", { name: "Sabun yok · Zemin kat WC" })
    ).toBeVisible()
    await expect(page.getByText("Tamamlandı").first()).toBeVisible()
    // Portalda personel adı yerine ekip gösterilir
    await expect(page.getByText("Saha ekibi")).toBeVisible()
    await expect(
      page.getByRole("img", { name: "Tamamlanma fotoğrafı" })
    ).toBeVisible()
  })

  test("E2E-4.2 şablon düzenleyici: ağırlık toplamı 100 değilse kaydedilemez, 100 olunca yeni sürüm (TC-4.1-01)", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/kalite/sablonlar/ats-temizlik-orta-firma-ofis", {
      kullanici: "supervizor",
    })
    const total = page.locator("#weight-total")
    await expect(total).toContainText("100 / 100")
    const save = page.getByRole("button", { name: "Kaydet (yeni sürüm)" })
    await page.getByLabel("Madde 1.1 Ağırlık").fill("10")
    await expect(total).toContainText("95 / 100")
    await expect(save).toBeDisabled()
    await page.getByLabel("Madde 1.2 Ağırlık").fill("20")
    await expect(total).toContainText("100 / 100")
    await save.click()
    await expect(page.getByText("Şablon kaydedildi")).toBeVisible()
    await expect(page.getByText(/^Sürüm 3 ·/)).toBeVisible()
  })

  test("E2E-4.3 iş emri panosu: sürükle-bırak eylem diyaloğunu açar, geçersiz geçiş engellenir (TC-4.4-03)", async ({
    page,
    gotoApp,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Sürükle-bırak masaüstü etkileşimi; mobilde kart menüsü kullanılır"
    )
    await gotoApp("/is-emirleri?gorunum=kanban", {
      senaryo: "work-order-sla-breach",
      saat: OCTOBER,
      kullanici: "supervizor",
    })
    const board = page.getByRole("region", { name: "İş emri panosu" })
    const card = board.getByRole("article", { name: /Zamanında: Cam silme/ })
    await expect(card).toBeVisible()
    const handle = card.getByRole("button", { name: /kartını taşı$/ })

    async function drag(columnName: RegExp) {
      // hover tutamacı görünür alana kaydırır ve işaretçiyi ortasına getirir
      await handle.hover()
      const from = await handle.boundingBox()
      if (!from) throw new Error("Tutamaç bulunamadı")
      await page.mouse.down()
      await page.mouse.move(from.x + 30, from.y + 10, { steps: 5 })
      const to = await board
        .getByRole("region", { name: columnName })
        .boundingBox()
      if (!to) throw new Error("Sütun bulunamadı")
      // Sütunlar aynı yükseklikte uzar: tutamaçla aynı hizada hedef sütunun içi
      const tx = to.x + to.width / 2
      const ty = from.y + from.height / 2
      await page.mouse.move(tx, ty, { steps: 15 })
      await page.mouse.move(tx + 1, ty + 1)
      await page.mouse.up()
    }

    await drag(/^Tamamlandı/)
    // Gürültü verisindeki yoklama alarmı toast'ları yığının üstüne binebilir; mesajı
    // bildirim bölgesinin içeriğinde, sonucu ise panoda doğrula
    await expect(page.locator("[data-sonner-toaster]")).toContainText(
      '"Yeni" durumundan "Tamamlandı" durumuna geçilemez'
    )
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(
      board.getByRole("region", { name: /^Yeni/ }).getByRole("article", {
        name: /Zamanında: Cam silme/,
      })
    ).toBeVisible()
    await drag(/^Atandı/)
    await expect(page.getByRole("dialog", { name: "Ata" })).toBeVisible()
  })

  test("E2E-4.4 QR sayfası (geçerli ve iptal edilmiş etiket) WCAG 2.1 AA", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp(`/q/${TOKEN}`, {
      senaryo: "quality-demo",
      saat: OCTOBER,
      kullanici: null,
    })
    await expect(
      page.getByRole("heading", { name: "Zemin kat WC" })
    ).toBeVisible()
    await expectNoA11yViolations()

    await gotoApp(`/q/${TOKEN}-ESKI`, {
      senaryo: "quality-demo",
      saat: OCTOBER,
      kullanici: null,
    })
    await expect(
      page.getByRole("heading", { name: "Bu QR kod artık kullanılmıyor" })
    ).toBeVisible()
    await expectNoA11yViolations()
  })

  test("E2E-4.5 iş emri panosu ve denetim listesi WCAG 2.1 AA", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp("/is-emirleri?gorunum=kanban", {
      senaryo: "work-order-sla-breach",
      saat: OCTOBER,
      kullanici: "supervizor",
    })
    await expect(
      page.getByRole("region", { name: "İş emri panosu" })
    ).toBeVisible()
    await expectNoA11yViolations()

    await gotoApp("/kalite", { saat: OCTOBER, kullanici: "supervizor" })
    await expect(
      page.getByRole("table", { name: "Denetim sonuçları" })
    ).toBeVisible()
    await expectNoA11yViolations()
  })

  test("E2E-4.6 müşteri portalı özeti ve aylık rapor WCAG 2.1 AA", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp("/portal", { saat: OCTOBER, kullanici: "musteri" })
    await expect(page.getByText("SLA uyumu")).toBeVisible()
    await expectNoA11yViolations()

    await gotoApp("/portal/raporlar?ay=2026-09", {
      senaryo: "portal-month-report",
      saat: OCTOBER,
      kullanici: "musteri",
    })
    await expect(page.getByText("SLA ve iş emirleri")).toBeVisible()
    await expectNoA11yViolations()
  })
})
