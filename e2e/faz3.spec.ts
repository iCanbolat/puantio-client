import { expect, test } from "./fixtures"

const OCTOBER = "2026-10-05T10:00:00+03:00"

test.describe("Faz 3: sözleşme, kadro taahhüdü ve hakediş", () => {
  test("E2E-3.1 sözleşme oluştur (3 lokasyon, taahhüt, birim fiyat) → hakediş taslağı → onay akışı → Excel indir", async ({
    page,
    gotoApp,
  }) => {
    test.slow()
    // Üç veya daha fazla lokasyonu olan müşteri
    await gotoApp("/musteriler", { saat: OCTOBER, kullanici: "finans" })
    const customers = page.getByRole("table", { name: "Müşteriler" })
    await expect(customers.getByRole("row").nth(2)).toBeVisible()
    let customerName = ""
    for (const row of await customers.getByRole("row").all()) {
      const cells = await row.getByRole("cell").allTextContents()
      if (cells.length > 4 && Number(cells[4]) >= 3) {
        customerName = (await row.getByRole("link").first().textContent()) ?? ""
        break
      }
    }
    expect(customerName).not.toBe("")

    await gotoApp("/sozlesmeler/yeni", { saat: OCTOBER, kullanici: "finans" })
    await page
      .getByRole("textbox", { name: "Sözleşme adı" })
      .fill("E2E temizlik sözleşmesi")
    await page
      .getByRole("combobox", { name: "Müşteri" })
      .fill(customerName.slice(0, 6))
    await page.getByRole("option", { name: customerName }).first().click()
    await page
      .getByRole("combobox", { name: "Yüklenici tüzel kişilik" })
      .click()
    await page.getByRole("option").first().click()
    await page.getByLabel("Başlangıç").fill("2026-01-01")
    await page.getByLabel("Bitiş").fill("2026-12-31")
    await page.getByRole("button", { name: "İleri" }).click()

    await page.getByRole("checkbox", { name: "Temizlik" }).click()
    await page.getByRole("button", { name: "İleri" }).click()

    const picks = page.getByRole("checkbox", { name: / seç$/ })
    for (let index = 0; index < 3; index += 1) await picks.nth(index).click()
    await expect(page.getByText("3 lokasyon seçildi")).toBeVisible()
    await page.getByRole("button", { name: "İleri" }).click()

    const headcounts = page.getByRole("spinbutton", { name: /taahhüt kadro$/ })
    await expect(headcounts).toHaveCount(3)
    for (let index = 0; index < 3; index += 1)
      await headcounts.nth(index).fill("3")
    await page.getByRole("button", { name: "İleri" }).click()

    await page.getByLabel("Temizlik personeli (kişi/ay)").fill("42.000,00")
    await page.getByRole("button", { name: "İleri" }).click()
    await page.getByRole("button", { name: "İleri" }).click()
    await expect(
      page.getByRole("list", { name: "Taahhüt özeti" })
    ).toContainText("3 kişi")
    await page.getByRole("button", { name: "Sözleşmeyi kaydet" }).click()
    await expect(
      page.getByRole("heading", { name: "E2E temizlik sözleşmesi" })
    ).toBeVisible()
    const code =
      (await page
        .getByRole("main")
        .locator("header p .font-mono")
        .first()
        .textContent()) ?? ""
    expect(code).toMatch(/^SOZ-2026-/)

    // Hakediş taslağı: Ağustos puantajı kilitli (İK onaylı)
    await page.getByRole("link", { name: "Hakedişler" }).click()
    await page.getByRole("button", { name: "Yeni hakediş" }).click()
    const create = page.getByRole("dialog", { name: "Yeni hakediş" })
    await create.getByRole("combobox", { name: "Sözleşme" }).click()
    await page.getByRole("option", { name: new RegExp(code) }).click()
    await create.getByRole("combobox", { name: "Dönem" }).click()
    await page.getByRole("option", { name: "Ağustos 2026" }).click()
    await create.getByRole("button", { name: "Taslak oluştur" }).click()
    await expect(
      page.getByRole("heading", { name: /^Hakediş HK-202608/ })
    ).toBeVisible()
    await expect(page.getByTestId("payment-total")).toContainText("₺")

    const act = async (
      name: string,
      fill?: { label: string; value: string }
    ) => {
      await page.getByRole("button", { name }).click()
      const dialog = page.getByRole("dialog", { name })
      if (fill) await dialog.getByLabel(fill.label).fill(fill.value)
      await dialog.getByRole("button", { name: "Onayla" }).click()
      await expect(dialog).toBeHidden()
    }
    await act("Kontrole gönder")
    await act("Kontrol onayı ver, müşteriye gönder")
    await act("Müşteri adına onayla", {
      label: "Gerekçe",
      value: "Müşteri yetkilisi e-postayla onayladı",
    })
    await act("Faturalandı olarak işaretle", {
      label: "Fatura numarası",
      value: "PNT2026000999",
    })
    await expect(
      page
        .getByRole("list", { name: "Hakediş adımları" })
        .getByText("Faturalandı")
    ).toHaveAttribute("aria-current", "step")

    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "Excel indir" }).click()
    expect((await download).suggestedFilename()).toMatch(
      /^hakedis-HK-202608-\d{3}\.xlsx$/
    )
  })

  test("E2E-3.2 headcount-shortfall: rapor '120 / 112, −8 (%6,7)' ve lokasyona iniş (TC-3.2-01, TC-3.2-02)", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/kadro-raporu?sozlesme=ct-temizlik-orta-kadro&ay=2026-09", {
      senaryo: "headcount-shortfall",
      saat: OCTOBER,
      kullanici: "finans",
    })
    await expect(page.getByTestId("headcount-gap")).toHaveText(
      "120 / 112, −8 (%6,7)"
    )
    await page
      .getByRole("button", { name: "Kadro Kampüsü A Blok personel ayrıntısı" })
      .click()
    const people = page.getByRole("list", { name: "Personel ve eksik günler" })
    await expect(people.getByRole("listitem")).toHaveCount(46)
    await expect(people.getByRole("listitem").first()).toContainText(
      "Eksik gün yok"
    )
    await page.keyboard.press("Escape")

    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "Excel indir" }).click()
    expect((await download).suggestedFilename()).toBe(
      "kadro-raporu-2026-09.xlsx"
    )
  })

  test("E2E-3.3 kadro raporu, hakediş ve sözleşme sihirbazı WCAG 2.1 AA", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp("/kadro-raporu?sozlesme=ct-temizlik-orta-kadro&ay=2026-09", {
      senaryo: "headcount-shortfall",
      saat: OCTOBER,
      kullanici: "finans",
    })
    await expect(page.getByTestId("headcount-gap")).toBeVisible()
    await expectNoA11yViolations()

    await gotoApp("/hakedis", {
      senaryo: "stale-progress-payment",
      saat: OCTOBER,
      kullanici: "finans",
    })
    const table = page.getByRole("table", { name: "Hakedişler" })
    await expect(table.getByText("Güncel değil")).toBeVisible()
    await expectNoA11yViolations()
    await table.getByRole("link", { name: /HK-202609-002/ }).click()
    await page.getByRole("button", { name: "Farkı göster" }).click()
    await expect(
      page.getByRole("table", { name: "Fark tablosu" })
    ).toBeVisible()
    await expectNoA11yViolations()

    await gotoApp("/sozlesmeler/yeni", { saat: OCTOBER, kullanici: "finans" })
    await expect(
      page.getByRole("textbox", { name: "Sözleşme adı" })
    ).toBeVisible()
    await expectNoA11yViolations()
  })
})
