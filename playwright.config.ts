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
  // Faz 6 ile 82 senaryo: verify'da soğuk başlayan dev sunucusunu 5 işçi boğuyor, ilk
  // testler lazy derlemede 30 sn'yi aşıyordu (tek başına geçiyorlar). Yerelde 4 işçi.
  workers: isCI ? undefined : 4,
  // Paket ve route ağacı büyüdükçe paralel yük altında dev sunucusunun lazy chunk derlemesi
  // 5 sn'yi aşabiliyor (Faz 4'te verify'da görüldü; testler tek başına 1–2 sn'de geçiyor)
  expect: { timeout: 10_000 },
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
