import { z } from "zod"

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true")

export const envSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default("/api"),
  VITE_REALTIME_URL: z.string().optional(),
  VITE_API_MOCKING: booleanString,
  VITE_APP_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  /**
   * Kiracı alt alan adlarının kökü: `<kiracı>.puantio.com`. Kiracıya özel ayarlar build'e
   * girmez; çalışma anında `GET /public/tenant-config` ile gelir.
   */
  VITE_TENANT_BASE_DOMAIN: z.string().min(1).default("puantio.com"),
  /** Alt alan adı olmayan ortamlarda (localhost, önizleme) kullanılacak kiracı */
  VITE_DEFAULT_TENANT: z.string().min(1).default("temizlik-orta"),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: Record<string, unknown>): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new Error(
      `Geçersiz ortam değişkenleri:\n${z.prettifyError(result.error)}`
    )
  }
  return result.data
}

export const env = parseEnv(import.meta.env)
