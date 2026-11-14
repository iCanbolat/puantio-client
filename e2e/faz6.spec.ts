import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"

const OCTOBER = "2026-10-05T10:00:00+03:00"
/** Senaryo lokasyonu (temizlik-orta kökündeki ilk lokasyon; senaryo onu hastane yapar) */
const HOSPITAL = "loc-temizlik-orta-1"
const PERSON = "per-temizlik-orta-1"
// Küçük PDF (özlük belgesi yükleme)
const PDF = {
  name: "is-sozlesmesi.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n%Puantio E2E\n%%EOF\n"),
}

/** Bellek içi mock veri korunsun diye istemci tarafı yönlendirme */
async function clientNavigate(page: Page, path: string) {
  await page.evaluate((target) => {
    window.history.pushState(null, "", target)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }, path)
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

test.describe("Faz 6: İSG ve özlük", () => {
  test("E2E-6.1 süresi dolmuş sertifika → panoda engel → sertifika yenilenir → atama kaydedilir (TC-6.3-01)", async ({
    page,
    gotoApp,
    isMobile,
  }) => {
    test.skip(isMobile, "Pano masaüstü akışı; mobil a11y E2E-6.5'te")
    test.slow()
    await gotoApp(`/vardiya?lokasyon=${HOSPITAL}`, {
      senaryo: "expired-certificates",
      saat: OCTOBER,
      kullanici: "admin",
    })
    await expect(
      page.getByRole("table", { name: /vardiya planı/ })
    ).toBeVisible()
    const warning = page
      .getByRole("list", { name: "Kural ihlalleri" })
      .getByRole("listitem")
      .filter({
        hasText: /Hastane enfeksiyon eğitimi sertifikası .* sona erdi/,
      })
      .first()
    await expect(warning).toBeVisible()
    const name = (
      (await warning.locator("span.font-medium").first().textContent()) ?? ""
    )
      .replace(":", "")
      .trim()
    expect(name).not.toBe("")
    const sunday = page.getByRole("button", {
      name: new RegExp(`^${escape(name)}, 11\\.10\\.2026`),
    })

    // 1) Taslak atama engellenir
    await sunday.click()
    const picker = page.getByRole("dialog", { name: "Vardiya seç" })
    await picker.getByRole("button", { name: /Sabah/ }).click()
    await expect(sunday).toHaveAttribute("data-violation", "block")
    await expect(page.getByText("Kaydı engelleyen ihlaller var")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Planı kaydet" })
    ).toBeDisabled()

    // 2) İSG kaydı yenilenir
    await clientNavigate(page, "/isg/sertifikalar?bucket=expired")
    const table = page.getByRole("table", { name: "Personel sertifikaları" })
    const row = table.getByRole("row").filter({ hasText: name })
    await row.getByRole("button", { name: "Yenile" }).click()
    const dialog = page.getByRole("dialog", { name: "Sertifikayı yenile" })
    await dialog.getByLabel("Belge no").fill("HE-2026-E2E")
    await dialog.getByRole("button", { name: "Kaydet" }).click()
    await expect(page.getByText("Sertifika kaydedildi")).toBeVisible()

    // 3) Panoda taslak korunur, engel kalkar ve plan kaydedilir
    await clientNavigate(page, `/vardiya?lokasyon=${HOSPITAL}`)
    await expect(sunday).toBeVisible()
    await expect(sunday).not.toHaveAttribute("data-violation", "block")
    await expect(page.getByText("Kaydı engelleyen ihlaller var")).toHaveCount(0)
    await page.getByRole("button", { name: "Planı kaydet" }).click()
    await expect(page.getByText(/Plan kaydedildi/)).toBeVisible()
  })

  test("E2E-6.2 İSG uzmanı sağlık verisini gerekçeyle görür, erişim kaydına düşer; İK sekmeyi görmez (TC-6.2-01, TC-6.2-02)", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(`/personel/${PERSON}?sekme=saglik`, {
      saat: OCTOBER,
      kullanici: "isg",
    })
    await page.getByRole("button", { name: "Göster" }).click()
    const dialog = page.getByRole("dialog", { name: "Sağlık verisini göster" })
    await dialog.getByRole("button", { name: "Göster" }).click()
    await expect(
      dialog.getByText("Gerekçe en az 10 karakter olmalı")
    ).toBeVisible()
    await dialog.getByLabel("Gerekçe").fill("İşe dönüş muayenesi kontrolü")
    await dialog.getByRole("button", { name: "Göster" }).click()
    await expect(page.getByLabel("Sağlık kaydı")).toBeVisible()
    await clientNavigate(page, "/isg/saglik/erisim-kayitlari")
    await expect(
      page
        .getByRole("table", { name: "Sağlık verisi erişim kayıtları" })
        .getByText("İşe dönüş muayenesi kontrolü")
    ).toBeVisible()

    await gotoApp(`/personel/${PERSON}?sekme=saglik`, {
      saat: OCTOBER,
      kullanici: "ik",
    })
    const tabs = page.getByRole("tablist")
    await expect(tabs.getByRole("tab", { name: "Özlük" })).toBeVisible()
    await expect(tabs.getByRole("tab", { name: "Sağlık" })).toHaveCount(0)
    await expect(page.getByText(/maskeli/)).toHaveCount(0)
  })

  test("E2E-6.3 özlük belgesi yüklenir, tamamlanma yüzdesi artar (TC-6.4-01)", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/ozluk?durum=eksik", {
      senaryo: "personnel-file-incomplete",
      saat: OCTOBER,
      kullanici: "ik",
    })
    const table = page.getByRole("table", {
      name: "Özlük dosyası tamamlanma durumu",
    })
    await table.getByRole("link").first().click()
    const bar = page.getByRole("progressbar", {
      name: "Özlük dosyası tamamlanma",
    })
    await expect(bar).toBeVisible()
    const before = Number(await bar.getAttribute("aria-valuenow"))
    expect(before).toBeLessThan(100)
    const missing = page
      .getByRole("list", { name: "Belgeler" })
      .getByRole("listitem")
      .filter({ hasText: "Eksik" })
      .first()
    await missing.getByRole("button", { name: "Yükle" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Belge").setInputFiles(PDF)
    await dialog.getByRole("button", { name: "Yükle" }).click()
    await expect(page.getByText("Belge yüklendi")).toBeVisible()
    await expect
      .poll(async () => Number(await bar.getAttribute("aria-valuenow")))
      .toBeGreaterThan(before)
  })

  test("E2E-6.4 müşteri portalda hastane lokasyonunun denetim paketini görür ve Excel indirir (TC-6.5-01) + WCAG 2.1 AA", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp("/portal/denetim-paketi", {
      senaryo: "audit-pack-hospital",
      saat: OCTOBER,
      kullanici: "musteri",
    })
    await page.getByLabel("Hizmet noktası").click()
    await page.getByRole("option").first().click()
    const table = page.getByRole("table", {
      name: /personel uygunluk listesi/,
    })
    await expect(table).toBeVisible()
    await expect(table.getByText("Sağlık uygunluğu")).toBeVisible()
    await expect(table.getByText(/Şartlı uygun/)).toHaveCount(0)
    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "Excel indir" }).click()
    expect((await download).suggestedFilename()).toMatch(
      /^isg-denetim-paketi-.*\.xlsx$/
    )
    await expectNoA11yViolations()
  })

  test("E2E-6.5 İSG genel bakış, sertifikalar ve sağlık listesi WCAG 2.1 AA", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp("/isg", {
      senaryo: "expired-certificates",
      saat: OCTOBER,
      kullanici: "isg",
    })
    await expect(
      page.getByRole("heading", { name: "Sertifika uyarı kovaları" })
    ).toBeVisible()
    await expectNoA11yViolations()
    await clientNavigate(page, "/isg/sertifikalar")
    await expect(
      page.getByRole("table", { name: "Personel sertifikaları" })
    ).toBeVisible()
    await expectNoA11yViolations()
    await clientNavigate(page, "/isg/saglik")
    await expect(
      page.getByRole("table", { name: "Periyodik muayene durumu (maskeli)" })
    ).toBeVisible()
    await expectNoA11yViolations()
  })

  test("E2E-6.6 eğitimler, özlük dosyaları ve personel İSG sekmesi WCAG 2.1 AA", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp("/isg/egitimler", {
      senaryo: "training-overdue",
      saat: OCTOBER,
      kullanici: "isg",
    })
    await expect(
      page.getByRole("table", { name: "Personel eğitim durumu" })
    ).toBeVisible()
    await expectNoA11yViolations()
    await clientNavigate(page, "/ozluk")
    await expect(
      page.getByRole("table", { name: "Özlük dosyası tamamlanma durumu" })
    ).toBeVisible()
    await expectNoA11yViolations()
    await clientNavigate(page, `/personel/${PERSON}?sekme=isg`)
    await expect(page.getByText("Lokasyon gereksinimleri")).toBeVisible()
    await expectNoA11yViolations()
  })
})
