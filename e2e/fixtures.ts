import AxeBuilder from "@axe-core/playwright"
import { expect, test as base, type Page } from "@playwright/test"

export interface AppOptions {
  /** Mock senaryosu (ör. "server-error") */
  senaryo?: string
  /** Mock sunucu saati, ISO (ör. "2026-09-29T07:10:00+03:00") */
  saat?: string
  /** Veri seti: test (45 kayıt) | dev | scale */
  veri?: "test" | "dev" | "scale"
  /** Mock kiracı (gerçekte alt alan adı): temizlik-orta | cok-hatli-grup | guvenlik | entegre-buyuk | platform */
  kiraci?: string
  /**
   * Doğrudan oturum açılacak kullanıcı anahtarı (admin, bolge, supervizor, ik, destek…).
   * `null`: oturum açılmaz (giriş sayfası test edilir). Varsayılan: admin.
   */
  kullanici?: string | null
}

interface Fixtures {
  gotoApp: (path: string, options?: AppOptions) => Promise<void>
  expectNoA11yViolations: (options?: { include?: string }) => Promise<void>
  isMobile: boolean
  openMockPanel: () => Promise<void>
}

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    // Harita karolarını dış servisten çekme (deterministik ve ağdan bağımsız test)
    await page.route(/tile\.openstreetmap\.org/, (route) => route.abort())
    await use(page)
  },

  // Playwright fixture imzası nesne deseni ister
  // eslint-disable-next-line no-empty-pattern
  isMobile: async ({}, use, testInfo) => {
    await use(testInfo.project.name === "mobil")
  },

  gotoApp: async ({ page }, use) => {
    await use(async (path, options = {}) => {
      const url = new URL(path, "http://placeholder")
      for (const key of ["senaryo", "saat", "veri", "kiraci"] as const) {
        const value = options[key]
        if (value) url.searchParams.set(key, value)
      }
      const user = options.kullanici === undefined ? "admin" : options.kullanici
      if (user) url.searchParams.set("kullanici", user)
      await page.goto(`${url.pathname}${url.search}`)
      await expect(
        page.getByRole("button", { name: "Mock ve simülasyon paneli" })
      ).toBeVisible()
    })
  },

  openMockPanel: async ({ page }, use) => {
    await use(async () => {
      await page
        .getByRole("button", { name: "Mock ve simülasyon paneli" })
        .click()
      await expect(
        page.getByRole("dialog", { name: "Mock ve simülasyon" })
      ).toBeVisible()
    })
  },

  expectNoA11yViolations: async ({ page }, use) => {
    await use(async (options = {}) => {
      let builder = new AxeBuilder({ page }).withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
      ])
      if (options.include) builder = builder.include(options.include)
      const results = await builder.analyze()
      const summary = results.violations.map(
        (violation) =>
          `${violation.id} (${violation.impact ?? "?"}): ${violation.nodes
            .slice(0, 3)
            .map((node) => node.target.join(" "))
            .join(", ")}`
      )
      expect(summary).toEqual([])
    })
  },
})

export { expect }

/** Mobilde menü gizli; açıp bağlantıya tıklar. */
export async function navigateViaMenu(
  page: Page,
  isMobile: boolean,
  linkName: string | RegExp
) {
  if (isMobile)
    await page.getByRole("button", { name: "Menüyü aç/kapat" }).click()
  await page.getByRole("link", { name: linkName }).click()
}
