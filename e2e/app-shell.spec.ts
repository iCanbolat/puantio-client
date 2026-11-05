import { expect, navigateViaMenu, test } from "./fixtures"

test.describe("Uygulama kabuğu", () => {
  test("E2E-0.1 ana sayfa: mock API, canlı kanal ve yol haritası", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/")
    await expect(
      page.getByRole("heading", { name: "Operasyon paneli" })
    ).toBeVisible()
    await expect(
      page.getByText("Veriler MSW ile simüle ediliyor")
    ).toBeVisible()
    await expect(page.getByText("Bağlı", { exact: true })).toBeVisible()
    await expect(page.getByText("Faz 0: Altyapı")).toBeVisible()
  })

  test("E2E-0.2 menüden bileşen vitrinine gidilir, breadcrumb güncellenir", async ({
    page,
    gotoApp,
    isMobile,
  }) => {
    await gotoApp("/")
    await navigateViaMenu(page, isMobile, /Bileşen vitrini/)
    await expect(page).toHaveURL(/\/gelistirici\/bilesenler/)
    await expect(
      page.getByRole("heading", { name: "Bileşen vitrini" })
    ).toBeVisible()
    await expect(
      page
        .getByRole("navigation", { name: "Sayfa konumu" })
        .getByText("Bileşen vitrini")
    ).toBeVisible()
  })

  test("E2E-0.3 bilinmeyen adres menü içinde 404 gösterir", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/boyle-bir-sayfa-yok")
    await expect(page.getByText("Sayfa bulunamadı")).toBeVisible()
    await page.getByRole("link", { name: "Ana sayfaya dön" }).click()
    await expect(
      page.getByRole("heading", { name: "Operasyon paneli" })
    ).toBeVisible()
  })

  test("E2E-0.4 tema tercihi kalıcıdır", async ({ page, gotoApp }) => {
    await gotoApp("/")
    await page.getByRole("button", { name: "Tema seç" }).click()
    await page.getByRole("menuitemradio", { name: "Koyu" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator("html")).toHaveClass(/dark/)
  })

  test("E2E-0.5 ana sayfa WCAG 2.1 AA denetiminden geçer", async ({
    gotoApp,
    page,
    expectNoA11yViolations,
  }) => {
    await gotoApp("/")
    await expect(page.getByText("Bağlı", { exact: true })).toBeVisible()
    await expectNoA11yViolations()
  })
})
