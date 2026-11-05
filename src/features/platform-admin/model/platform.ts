import { z } from "zod"

import { supportSessionSchema } from "@/entities/session"
import {
  MODULE_IDS,
  PLATFORM_SLUG,
  RESERVED_SLUGS,
  moduleIdSchema,
  serviceLineSchema,
  tenantSlugSchema,
} from "@/entities/tenant"
import { isoDateTimeSchema } from "@/shared/lib/date"

export const platformTenantSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  shortName: z.string(),
  status: z.enum(["active", "suspended"]),
  modules: z.array(moduleIdSchema),
  serviceLines: z.array(serviceLineSchema),
  userCount: z.number().int(),
  personnelCount: z.number().int(),
  locationCount: z.number().int(),
  adminEmail: z.string(),
  createdAt: isoDateTimeSchema,
})
export type PlatformTenant = z.infer<typeof platformTenantSchema>
export const platformTenantListSchema = z.object({
  items: z.array(platformTenantSchema),
})

const reserved: readonly string[] = [...RESERVED_SLUGS, PLATFORM_SLUG]

export const createTenantSchema = z.object({
  displayName: z.string().trim().min(3, "Firma adı girin").max(120),
  shortName: z.string().trim().min(2, "Kısa ad girin").max(24),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => tenantSlugSchema.safeParse(value).success && value.length >= 2,
      "Alt alan adı küçük harf, rakam ve tireden oluşmalı (2–40 karakter)"
    )
    .refine((value) => !reserved.includes(value), "Bu alt alan adı ayrılmış"),
  modules: z
    .array(moduleIdSchema)
    .refine((items) => items.includes("core"), "Çekirdek modül zorunludur"),
  serviceLines: z
    .array(serviceLineSchema)
    .min(1, "En az bir hizmet hattı seçin"),
  orgLevelCount: z.union([z.literal(1), z.literal(2)]),
  adminName: z.string().trim().min(3, "Yöneticinin adını girin"),
  adminEmail: z.email("Geçerli bir e-posta girin").trim().toLowerCase(),
})
export type CreateTenantInput = z.input<typeof createTenantSchema>
export type CreateTenantPayload = z.output<typeof createTenantSchema>

export const updateTenantSchema = z.object({
  modules: z.array(moduleIdSchema).optional(),
  status: z.enum(["active", "suspended"]).optional(),
})
export type UpdateTenantPayload = z.infer<typeof updateTenantSchema>

export const SUPPORT_DURATIONS = [30, 60, 120] as const

export const startSupportSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Gerekçe en az 10 karakter olmalı")
    .max(300),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(120)]),
})
export type StartSupportInput = z.infer<typeof startSupportSchema>

export const platformSupportSessionSchema = supportSessionSchema.extend({
  endedAt: isoDateTimeSchema.nullable(),
})
export type PlatformSupportSession = z.infer<
  typeof platformSupportSessionSchema
>
export const platformSupportSessionListSchema = z.object({
  items: z.array(platformSupportSessionSchema),
})

export const DEFAULT_MODULES = MODULE_IDS.filter(
  (module) => !["maintenance", "security_patrol"].includes(module)
)
