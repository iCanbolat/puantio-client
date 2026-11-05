import { expect, test } from "./fixtures"

test.describe("Mock simülasyonu", () => {
  test("E2E-0.11 URL ile saat seçilir, panelden ileri sarılır (TC-0.4-02)", async ({
    page,
    gotoApp,
    openMockPanel,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Sunucu saati üst çubukta yalnızca geniş ekranda gösterilir"
    )
    await gotoApp("/", { saat: "2026-09-29T07:10:00+03:00" })
    await expect(page.getByTestId("server-clock")).toHaveText("07:10")

    await openMockPanel()
    await page.getByRole("button", { name: "+15 dk" }).click()
    await expect(page.getByTestId("mock-clock")).toHaveText("07:25")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("server-clock")).toHaveText("07:25")

    // Ayar sayfa yenilemede korunur
    await page.reload()
    await expect(page.getByTestId("server-clock")).toHaveText("07:25")
  })

  test("E2E-0.12 SLA geri sayımı saat ileri sarılınca eşik değiştirir", async ({
    page,
    gotoApp,
    openMockPanel,
  }) => {
    await gotoApp("/gelistirici/bilesenler?bolum=zaman")
    const timers = page.getByRole("timer")
    await expect(timers).toHaveCount(3)
    await expect(timers.nth(0)).toHaveAttribute("data-state", "ok")
    await expect(timers.nth(1)).toHaveAttribute("data-state", "warning")
    await expect(timers.nth(2)).toHaveAttribute("data-state", "breached")

    await openMockPanel()
    await page.getByRole("button", { name: "+5 dk" }).click()
    await page.getByRole("button", { name: "+5 dk" }).click()
    await page.keyboard.press("Escape")

    await expect(timers.nth(0)).toHaveAttribute("data-state", "warning")
    await expect(timers.nth(1)).toHaveAttribute("data-state", "breached")
  })

  test("E2E-0.13 endpoint'e hata enjekte edilir (ağ kaosu)", async ({
    page,
    gotoApp,
    openMockPanel,
  }) => {
    await gotoApp("/gelistirici/bilesenler", { veri: "test" })
    await expect(
      page.getByRole("table", { name: "Vitrin kayıtları" }).getByRole("row")
    ).toHaveCount(21)

    await openMockPanel()
    await page
      .getByRole("textbox", { name: "Yol içerir" })
      .fill("/showcase/records")
    await page.getByRole("button", { name: "Hata kuralı ekle" }).click()
    await expect(page.getByText("ANY /showcase/records → 500")).toBeVisible()
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: "Sonraki sayfa" }).click()
    await expect(
      page.getByText("Sunucuda bir hata oluştu. Lütfen tekrar deneyin.").first()
    ).toBeVisible()
  })

  test("E2E-0.14 geofence haritası: tıklanan merkez ve yarıçap anında hesaplanır", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/gelistirici/bilesenler?bolum=harita")
    const map = page.getByRole("application", { name: /Geofence haritası/ })
    await expect(map).toBeVisible()
    await expect(page.getByText("Henüz merkez seçilmedi")).toBeVisible()

    const box = await map.boundingBox()
    if (!box) throw new Error("Harita boyutu alınamadı")
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByText(/^Merkez: /)).toBeVisible()
    await expect(
      page.getByText(/Örnek check-in geofence (içinde|dışında)/)
    ).toBeVisible()

    await page.getByLabel("Geofence yarıçapı (metre)").fill("25")
    await page.getByLabel("Geofence yarıçapı (metre)").blur()
    await expect(
      page.getByText(/Örnek check-in geofence dışında/)
    ).toBeVisible()
  })
})
