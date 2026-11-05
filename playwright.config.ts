import { defineConfig, devices } from "@playwright/test"

const PORT = 5174
const isCI = Boolean(process.env.CI)

/**
 * E2E testleri gerçek tarayıcıda, MSW worker ile mock API üzerinde çalışır.
 * Senaryo/saat/veri seti URL ile seçilir: `?senaryo=server-error&saat=...&veri=test`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "masaustu", use: { ...devices["Desktop Chrome"] } },
    { name: "mobil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    env: { VITE_API_MOCKING: "true", VITE_APP_ENV: "test" },
    timeout: 60_000,
  },
})
