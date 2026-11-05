import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Excel içe aktarma sayfası SheetJS içerir (~166 KB gzip); yalnızca /ice-aktar açılınca yüklenir
    chunkSizeWarningLimit: 600,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
    testTimeout: 20_000,
    // Ağır entegrasyon testleri (tam route render) aşırı paralellikte kararsızlaşır
    maxWorkers: "50%",
    env: {
      VITE_API_BASE_URL: "http://localhost/api",
      VITE_API_MOCKING: "false",
      VITE_APP_ENV: "test",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/shared/ui/**",
        // Yalnızca gerçek tarayıcıda anlamlı: E2E (Playwright) ile doğrulanır
        "src/main.tsx",
        "src/app/app.tsx",
        "src/app/app-context.ts",
        "src/mocks/browser.ts",
        "src/mocks/devtools/**",
        "src/shared/components/map-picker/map-picker.tsx",
        "src/shared/components/cluster-map/cluster-map.tsx",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
        "src/shared/lib/**": { lines: 90, functions: 90, statements: 90 },
      },
    },
  },
})
