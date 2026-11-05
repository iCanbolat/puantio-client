import js from "@eslint/js"
import globals from "globals"
import jsxA11y from "eslint-plugin-jsx-a11y"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

/**
 * Katman kuralı: app → features → entities → shared
 * - Alt katman üst katmanı import edemez.
 * - Başka bir feature/entity'ye yalnızca public API (index.ts) üzerinden erişilir.
 *   Feature içi dosyalar birbirini göreli yol ile import eder.
 * - Uygulama kodu mock katmanını import edemez (yalnızca main.tsx dinamik yükler).
 */
const deepFeatureImport = {
  group: ["@/features/*/**"],
  message:
    "Başka bir feature'a yalnızca public API üzerinden erişin: '@/features/<ad>'.",
}
const deepEntityImport = {
  group: ["@/entities/*/**"],
  message:
    "Entity'lere yalnızca public API üzerinden erişin: '@/entities/<ad>'.",
}
const mocksImport = {
  group: ["@/mocks", "@/mocks/**"],
  message: "Uygulama kodu mock katmanına bağımlı olamaz.",
}
const testImport = {
  group: ["@/test", "@/test/**"],
  message: "Test yardımcıları yalnızca test dosyalarında kullanılabilir.",
}
const upward = (layers) =>
  layers.map((layer) => ({
    group: [`@/${layer}`, `@/${layer}/**`],
    message: `Bu katman '${layer}' katmanını import edemez (app → features → entities → shared).`,
  }))

export default defineConfig([
  globalIgnores([
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
    "public/mockServiceWorker.js",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // React Router yönlendirmeleri `throw redirect()` ile (Response) yapılır
      "@typescript-eslint/only-throw-error": [
        "error",
        { allow: [{ from: "lib", name: "Response" }] },
      ],
    },
  },
  {
    files: ["src/**/*.tsx"],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  // shadcn tarafından üretilen dosyalar: CLI ile güncellendiği için stil kurallarını gevşet
  {
    files: ["src/shared/ui/**"],
    rules: {
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-deprecated": "off",
      "jsx-a11y/heading-has-content": "off",
      "jsx-a11y/anchor-has-content": "off",
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
  // Katman kuralları
  {
    files: ["src/shared/**"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...upward(["app", "features", "entities"]),
            mocksImport,
            testImport,
          ],
        },
      ],
    },
  },
  {
    files: ["src/entities/**"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...upward(["app", "features"]),
            deepEntityImport,
            mocksImport,
            testImport,
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**"],
    ignores: ["src/features/*/mocks/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...upward(["app"]),
            deepFeatureImport,
            deepEntityImport,
            mocksImport,
            testImport,
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            deepFeatureImport,
            deepEntityImport,
            mocksImport,
            testImport,
          ],
        },
      ],
    },
  },
  // Test ve mock dosyaları
  {
    files: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/mocks/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["e2e/**", "playwright.config.ts", "vite.config.ts"],
    languageOptions: { globals: globals.node },
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
