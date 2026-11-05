import { expect, test } from "./fixtures"

const MONDAY = "2026-09-14"

test.describe("Faz 2: vardiya, yoklama ve puantaj", () => {
  test("E2E-2.1 saat 07:00, morning-no-show: alarm düşer → yedek atanır → pano güncellenir (TC-2.3-01, TC-2.3-03)", async ({
    page,
    gotoApp,
    openMockPanel,
  }) => {
    await gotoApp("/yoklama", {
      senaryo: "morning-no-show",
      saat: `${MONDAY}T06:58:00+03:00`,
      kullanici: "bolge",
    })
    await expect(
      page.getByRole("heading", { name: "Canlı yoklama" })
    ).toBeVisible()
    await expect(page.getByTestId("count-no_show")).toHaveText("0")

    // Saat ileri alınır: alarm değerlendirmesi WS ile ekrana düşer
    await openMockPanel()
    await page.getByRole("button", { name: "+15 dk" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("count-no_show")).toHaveText("3")
    await expect(page).toHaveTitle(/^\(3\) /)

    await page.getByRole("link", { name: "Alarm merkezi (3)" }).click()
    const alarms = page.getByRole("list", { name: "Alarmlar" })
    await expect(alarms.getByRole("listitem", { name: /alarmı$/ })).toHaveCount(
      3
    )
    await expect(alarms.getByRole("timer").first()).toBeVisible()

    await alarms.getByRole("button", { name: "Yedek ata" }).first().click()
    const dialog = page.getByRole("dialog", { name: "Yedek ata" })
    const distances = await dialog
      .getByTestId("candidate-distance")
      .allTextContents()
    const values = distances.map((text) =>
      Number(text.replace(" km", "").replace(",", "."))
    )
    expect(values).toEqual([...values].sort((a, b) => a - b))
    await dialog
      .getByRole("list", { name: "Yedek önerileri" })
      .getByRole("button")
      .first()
      .click()
    await dialog.getByRole("button", { name: "Yedeği ata" }).click()
    await expect(page.getByText("Yedek personel atandı")).toBeVisible()
    await expect(alarms.getByRole("listitem", { name: /alarmı$/ })).toHaveCount(
      2
    )

    await page.goBack()
    await expect(page.getByTestId("count-backup_assigned")).toHaveText("1")
    await expect(page.getByTestId("count-no_show")).toHaveText("2")
  })

  test("E2E-2.2 ay sonu: bölge onayı → İK onayı → kilit → bordro dosyası indirilir (TC-2.6-02)", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(
      "/puantaj/tsp-le-temizlik-orta-1-2026-09?orgUnitId=ou-temizlik-orta-MAR",
      {
        senaryo: "month-end-close",
        saat: "2026-10-02T10:00:00+03:00",
        kullanici: "admin",
      }
    )
    await expect(page.getByRole("grid", { name: "Puantaj" })).toBeVisible()
    for (const action of [
      "Bölge onayı ver",
      "İK onayı ver",
      "Dönemi kilitle",
    ]) {
      await page.getByRole("button", { name: action }).click()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: action })
        .click()
      await expect(page.getByRole("alertdialog")).toHaveCount(0)
    }
    await expect(page.getByText("Dönem kilitli")).toBeVisible()

    await page.getByRole("link", { name: "Bordroya aktar" }).click()
    await expect(
      page.getByRole("heading", { name: "Bordro aktarımı" })
    ).toBeVisible()
    await expect(
      page.getByRole("columnheader", { name: "Çalışılan Gün" })
    ).toBeVisible()
    const exportButton = page.getByRole("button", { name: "Dışa aktar" })
    await expect(exportButton).toBeEnabled()
    const download = page.waitForEvent("download")
    await exportButton.click()
    expect((await download).suggestedFilename()).toBe(
      "puantaj-lavanta-2026-09.xlsx"
    )
    await expect(
      page.getByRole("button", {
        name: "puantaj-lavanta-2026-09.xlsx dosyasını indir",
      })
    ).toBeVisible()
  })

  test("E2E-2.3 vardiya panosu: şablon sürükle-bırak, kural uyarısı, kaydet (TC-2.1-02)", async ({
    page,
    gotoApp,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Sürükle-bırak masaüstü etkileşimi; mobilde hücre diyaloğu kullanılır"
    )
    await gotoApp("/vardiya?lokasyon=loc-temizlik-orta-1", {
      saat: `${MONDAY}T09:00:00+03:00`,
      kullanici: "bolge",
    })
    const grid = page.getByRole("table", { name: /vardiya planı/ })
    await expect(grid).toBeVisible()
    const sundayCell = grid.locator('button[data-cell$="|2026-09-20"]').first()
    const source = page.getByTestId("palette-S")
    const from = await source.boundingBox()
    const to = await sundayCell.boundingBox()
    if (!from || !to) throw new Error("Sürükleme kutuları bulunamadı")
    await page.mouse.move(from.x + 10, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + 30, from.y + from.height / 2, { steps: 5 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 15,
    })
    await page.mouse.up()
    await expect(sundayCell).toHaveText(/S/)
    await expect(page.getByText("1 kaydedilmemiş değişiklik")).toBeVisible()
    await expect(
      page.getByRole("list", { name: "Kural ihlalleri" })
    ).toContainText("haftalık 45 saati")
    await page.getByRole("button", { name: "Planı kaydet" }).click()
    await expect(page.getByText("Plan kaydedildi (1 değişiklik)")).toBeVisible()
    await expect(page.getByText("Taslak yok")).toBeVisible()
  })

  test("E2E-2.4 alarm merkezi ve canlı pano WCAG 2.1 AA (mobil dahil)", async ({
    page,
    gotoApp,
    expectNoA11yViolations,
  }) => {
    await gotoApp("/yoklama/alarmlar", {
      senaryo: "morning-no-show",
      saat: `${MONDAY}T07:12:00+03:00`,
      kullanici: "supervizor",
    })
    await expect(
      page
        .getByRole("list", { name: "Alarmlar" })
        .getByRole("listitem", { name: /alarmı$/ })
    ).toHaveCount(3)
    await expectNoA11yViolations({ include: "#main" })
    await gotoApp("/yoklama", {
      senaryo: "morning-no-show",
      saat: `${MONDAY}T07:12:00+03:00`,
      kullanici: "supervizor",
    })
    await expect(
      page.getByRole("list", { name: "Bugünün vardiyaları" })
    ).toBeVisible()
    await expectNoA11yViolations({ include: "#main" })
  })
})
