import { expect, test } from "./fixtures"

const ROUTE = "/gelistirici/bilesenler"

test.describe("DataTable", () => {
  test("E2E-0.6 sayfa/sıralama URL'de kalır ve sayfa yenilemede korunur (TC-0.6-01)", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(ROUTE, { veri: "test" })
    const table = page.getByRole("table", { name: "Vitrin kayıtları" })
    await expect(table.getByRole("row")).toHaveCount(21)
    await expect(page.getByText("Sayfa 1 / 3")).toBeVisible()

    await page.getByRole("button", { name: "Ad: artan sırala" }).click()
    await expect(page).toHaveURL(/sort=name&order=asc/)
    await page.getByRole("button", { name: "Sonraki sayfa" }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText("Sayfa 2 / 3")).toBeVisible()
    const firstCode = await table
      .getByRole("row")
      .nth(1)
      .getByRole("cell")
      .nth(1)
      .textContent()

    await page.reload()
    await expect(page.getByText("Sayfa 2 / 3")).toBeVisible()
    await expect(
      page.getByRole("columnheader", { name: /^Ad/ })
    ).toHaveAttribute("aria-sort", "ascending")
    await expect(
      table.getByRole("row").nth(1).getByRole("cell").nth(1)
    ).toHaveText(firstCode ?? "")
  })

  test("E2E-0.7 sunucu hatası tablo içinde gösterilir; senaryo değişince veri gelir (TC-0.6-02)", async ({
    page,
    gotoApp,
    openMockPanel,
  }) => {
    await gotoApp(ROUTE, { senaryo: "server-error", veri: "test" })
    // Uygulama 5xx'te 2 kez üstel beklemeyle yeniden dener (~6 sn) sonra hatayı gösterir
    await expect(page.getByText("Veriler yüklenemedi")).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      page.getByRole("button", { name: "Tekrar dene" })
    ).toBeVisible()

    await openMockPanel()
    await page.getByRole("combobox", { name: "Senaryo" }).click()
    await page.getByRole("option", { name: "Varsayılan" }).click()
    await page.keyboard.press("Escape")

    const table = page.getByRole("table", { name: "Vitrin kayıtları" })
    await expect(table.getByRole("row")).toHaveCount(21)
  })

  test("E2E-0.8 arama, şehir filtresi ve CSV indirme", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(ROUTE, { veri: "test" })
    const table = page.getByRole("table", { name: "Vitrin kayıtları" })
    await expect(table.getByRole("row")).toHaveCount(21)

    await page
      .getByRole("searchbox", { name: "Kayıtlarda ara" })
      .fill("WLC-00012")
    await expect(page).toHaveURL(/q=WLC-00012/)
    await expect(table.getByRole("row")).toHaveCount(2)

    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "CSV" }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(
      /^vitrin-kayitlari-\d{4}-\d{2}-\d{2}\.csv$/
    )

    await page.getByRole("button", { name: "Filtreleri temizle" }).click()
    await expect(table.getByRole("row")).toHaveCount(21)

    const city = page.getByRole("combobox", { name: "Şehir filtresi" })
    await city.click()
    await city.fill("ankara")
    await page.getByRole("option", { name: /Ankara/ }).click()
    await expect(page).toHaveURL(/city=Ankara/)
    // Önceki sayfa verisi yeni sonuç gelene kadar gösterilir (keepPreviousData)
    await expect
      .poll(async () => [
        ...new Set(
          await table
            .getByRole("row")
            .locator("td:nth-child(4)")
            .allTextContents()
        ),
      ])
      .toEqual(["Ankara"])
  })

  test("E2E-0.9 düzenleme formu: sunucu 422 alan hatası (TC-0.3-04)", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(`${ROUTE}?q=WLC-00001`, { veri: "test" })
    const table = page.getByRole("table", { name: "Vitrin kayıtları" })
    const takenName = await table
      .getByRole("row")
      .nth(1)
      .getByRole("cell")
      .nth(2)
      .locator("span span")
      .first()
      .textContent()

    await page
      .getByRole("searchbox", { name: "Kayıtlarda ara" })
      .fill("WLC-00002")
    await expect(table.getByRole("row")).toHaveCount(2)
    await page
      .getByRole("button", { name: "WLC-00002 kaydını düzenle" })
      .click()
    const dialog = page.getByRole("dialog", { name: "Kaydı düzenle" })
    await dialog.getByLabel("Ad").fill(takenName ?? "")
    await dialog.getByRole("button", { name: "Kaydet" }).click()
    await expect(
      dialog.getByText("Bu ad WLC-00001 kodlu kayıtta kullanılıyor.")
    ).toBeVisible()
  })

  test("E2E-0.10 tablo ekranı WCAG 2.1 AA denetiminden geçer", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp(ROUTE, { veri: "test" })
    await expect(
      page.getByRole("table", { name: "Vitrin kayıtları" }).getByRole("row")
    ).toHaveCount(21)
    await expectNoA11yViolations({ include: "#main" })
  })
})
