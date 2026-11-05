import * as XLSX from "xlsx"

import { expect, navigateViaMenu, test } from "./fixtures"

/** Geçerli T.C. Kimlik No (checksum) */
function tckn(seed: number): string {
  const digits = String(100_000_000 + seed * 7919)
    .slice(0, 9)
    .split("")
    .map(Number)
  if (digits[0] === 0) digits[0] = 1
  const at = (index: number) => digits[index] ?? 0
  const odd = at(0) + at(2) + at(4) + at(6) + at(8)
  const even = at(1) + at(3) + at(5) + at(7)
  digits.push((((odd * 7 - even) % 10) + 10) % 10)
  digits.push(digits.reduce((sum, digit) => sum + digit, 0) % 10)
  return digits.join("")
}

test.describe("Faz 1: kiracı, kimlik ve ana veri", () => {
  test("E2E-1.1 oturumsuz kullanıcı kiracının giriş sayfasına yönlenir, e-posta ile girer ve geri döner (TC-1.1-01)", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/personel", { kiraci: "cok-hatli-grup", kullanici: null })
    await expect(page).toHaveURL(/\/giris\?donus=%2Fpersonel/)
    await expect(
      page.getByRole("heading", { name: "Çınar Şirketler Grubu" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Google ile giriş yap" })
    ).toBeVisible()
    await page.getByRole("button", { name: "E-posta ile giriş yap" }).click()
    await expect(page.getByRole("heading", { name: "Personel" })).toBeVisible()
    await expect(page).toHaveURL(/\/personel$/)
    await expect(page).toHaveTitle(/Çınar Grup · Puantio/)
  })

  test("E2E-1.2 rol bazlı menü ve 403: süpervizör hakediş ve kullanıcılar sayfasına giremez (TC-1.2-01)", async ({
    page,
    gotoApp,
    isMobile,
  }) => {
    await gotoApp("/hakedis", { kullanici: "supervizor" })
    await expect(page.getByText("Bu sayfaya erişim yetkiniz yok")).toBeVisible()
    if (isMobile)
      await page.getByRole("button", { name: "Menüyü aç/kapat" }).click()
    const menu = page
      .getByRole("complementary")
      .or(page.getByRole("dialog"))
      .last()
    await expect(page.getByRole("link", { name: /Personel/ })).toBeVisible()
    await expect(menu.getByRole("link", { name: /Müşteriler/ })).toHaveCount(0)
    await expect(menu.getByText("Hakediş")).toHaveCount(0)
  })

  test("E2E-1.3 kiracı terminolojisi: Çınar Grup'ta lokasyonlar 'Proje' olarak görünür (TC-1.0-03)", async ({
    page,
    gotoApp,
    isMobile,
  }) => {
    await gotoApp("/", { kiraci: "cok-hatli-grup" })
    await navigateViaMenu(page, isMobile, /Projeler/)
    await expect(page.getByRole("heading", { name: "Projeler" })).toBeVisible()
    await expect(page).toHaveURL(/\/lokasyonlar/)
    await expect(page.getByRole("link", { name: "Yeni proje" })).toBeVisible()
  })

  test("E2E-1.4 lokasyon oluştur (harita + geofence) → alan ekle → QR etiket bas", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/lokasyonlar/yeni", { veri: "test" })
    await page
      .getByRole("textbox", { name: "Kod", exact: true })
      .fill("lok-77777")
    await page
      .getByRole("textbox", { name: "Ad", exact: true })
      .fill("E2E Genel Müdürlük")
    await page.getByRole("combobox", { name: "Müşteri" }).fill("a")
    await page.getByRole("option").first().click()
    await page.getByRole("combobox", { name: "Bölge" }).click()
    await page.getByRole("option", { name: "Marmara" }).click()
    await page
      .getByRole("textbox", { name: "İl", exact: true })
      .fill("İstanbul")
    await page.getByRole("textbox", { name: "İlçe", exact: true }).fill("Şişli")
    await page
      .getByRole("textbox", { name: "Açık adres" })
      .fill("Büyükdere Caddesi No:1")

    const map = page.getByRole("application", { name: /Geofence haritası/ })
    await expect(map).toBeVisible()
    const box = await map.boundingBox()
    if (!box) throw new Error("Harita boyutu alınamadı")
    await page.mouse.click(box.x + box.width / 3, box.y + box.height / 3)
    await expect(page.getByText(/^Merkez: /)).toBeVisible()
    await page.getByLabel("Geofence yarıçapı (metre)").fill("150")
    await page.getByRole("button", { name: "Kaydet" }).click()

    await expect(
      page.getByRole("heading", { name: "E2E Genel Müdürlük" })
    ).toBeVisible()
    await page.getByRole("tab", { name: /Alanlar/ }).click()
    await page.getByRole("button", { name: "Yeni alan" }).click()
    const dialog = page.getByRole("dialog")
    await dialog
      .getByRole("textbox", { name: "Ad", exact: true })
      .fill("Giriş katı tuvaleti")
    await dialog.getByRole("button", { name: "Kaydet" }).click()
    await expect(
      page.getByRole("cell", { name: "Giriş katı tuvaleti", exact: true })
    ).toBeVisible()

    await page.getByRole("link", { name: "Etiket bas" }).click()
    await expect(page.getByText("2 etiket")).toBeVisible()
    const labels = page
      .getByRole("list", { name: "Etiketler" })
      .getByRole("listitem")
    await expect(labels).toHaveCount(2)
    await expect(labels.nth(1)).toContainText("Giriş katı tuvaleti")
    await expect(
      page.getByRole("img", { name: "Giriş katı tuvaleti QR kodu" })
    ).toBeVisible()
  })

  test("E2E-1.5 Excel ile 50 personel içe aktarılır ve listede görünür (TC-1.7-01)", async ({
    page,
    gotoApp,
    isMobile,
  }) => {
    await gotoApp("/ayarlar/tuzel-kisilikler", { veri: "test" })
    const vkn =
      (
        await page
          .getByRole("table")
          .getByRole("row")
          .nth(1)
          .getByRole("cell")
          .nth(1)
          .textContent()
      )?.trim() ?? ""
    expect(vkn).toMatch(/^\d{10}$/)

    const rows = Array.from({ length: 50 }, (_, index) => [
      `E2E${String(index + 1).padStart(3, "0")}`,
      tckn(index + 1),
      "Elif",
      `Aktarım${index + 1}`,
      "0532 000 00 00",
      "Temizlik personeli",
      "Temizlik",
      vkn,
      "",
      "01.10.2026",
      "Hayır",
    ])
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Sicil No",
        "T.C. Kimlik No",
        "Ad",
        "Soyad",
        "Cep Telefonu",
        "Pozisyon",
        "Hizmet Hattı",
        "İşveren VKN",
        "Lokasyon Kodu",
        "İşe Giriş Tarihi",
        "Yedek Havuzu",
      ],
      ...rows,
    ])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, "Personel")
    const buffer = XLSX.write(book, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer

    await page.goto("/ice-aktar?tur=personnel")
    await page.getByLabel("Excel dosyası yükle").setInputFiles({
      name: "personel.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    })
    await expect(page.getByText("50 satır okundu.")).toBeVisible()
    await page.getByRole("button", { name: "Devam" }).click()
    await page.getByRole("button", { name: "Doğrula" }).click()
    await page.getByRole("button", { name: "50 satırı içe aktar" }).click()
    await expect(
      page.getByText(/50 yeni, 0 güncellenen, 0 atlanan kayıt/)
    ).toBeVisible()

    // Mock veritabanı bellekte: tam sayfa yenilemeden uygulama içinde gezin
    await navigateViaMenu(page, isMobile, /^Personel$/)
    await page
      .getByRole("searchbox", { name: "Personelde ara" })
      .fill("Aktarım")
    const table = page.getByRole("table", { name: "Personel listesi" })
    await expect(table.getByRole("row")).toHaveCount(21)
    await expect(table.getByText("E2E001")).toBeVisible()
  })

  test("E2E-1.6 platform destek oturumu: gerekçe → kiracıya geçiş → destek bandı (TC-1.8-01)", async ({
    page,
    gotoApp,
    isMobile,
  }) => {
    await gotoApp("/platform/kiracilar/temizlik-orta", {
      kiraci: "platform",
      kullanici: "destek",
    })
    await expect(
      page.getByRole("heading", { name: "Lavanta Tesis Hizmetleri" })
    ).toBeVisible()
    await page.getByRole("button", { name: "Destek oturumu başlat" }).click()
    const dialog = page.getByRole("dialog", { name: "Destek oturumu başlat" })
    await dialog
      .getByLabel("Gerekçe")
      .fill("Destek talebi #42: bordro aktarımı kontrolü")
    await dialog.getByRole("button", { name: "Başlat ve firmaya geç" }).click()

    await expect(page.getByText("Destek modundasınız")).toBeVisible()
    await expect(page.getByText(/Gerekçe: Destek talebi #42/)).toBeVisible()
    if (isMobile)
      await page.getByRole("button", { name: "Menüyü aç/kapat" }).click()
    await expect(
      page.getByText("Lavanta", { exact: true }).first()
    ).toBeVisible()
  })

  test("E2E-1.7 dev panelinden kiracı değiştirilir: marka ve terminoloji güncellenir", async ({
    page,
    gotoApp,
    openMockPanel,
    isMobile,
  }) => {
    await gotoApp("/")
    await openMockPanel()
    await page.getByRole("combobox", { name: "Kiracı" }).click()
    await page
      .getByRole("option", { name: "Kalkan Güvenlik Hizmetleri" })
      .click()
    await expect(
      page.getByRole("heading", { name: "Operasyon paneli" })
    ).toBeVisible()
    await expect(page).toHaveTitle(/Kalkan · Puantio/)
    if (isMobile)
      await page.getByRole("button", { name: "Menüyü aç/kapat" }).click()
    await expect(
      page.getByRole("link", { name: /Görev yerleri/ })
    ).toBeVisible()
  })

  test("E2E-1.8 giriş sayfası ve personel listesi WCAG 2.1 AA denetiminden geçer", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp("/giris", { kiraci: "cok-hatli-grup", kullanici: null })
    await expect(
      page.getByRole("button", { name: "Google ile giriş yap" })
    ).toBeVisible()
    await expectNoA11yViolations()

    await gotoApp("/personel", { veri: "test" })
    await expect(
      page.getByRole("table", { name: "Personel listesi" }).getByRole("row")
    ).toHaveCount(21)
    await expectNoA11yViolations()
  })
})
