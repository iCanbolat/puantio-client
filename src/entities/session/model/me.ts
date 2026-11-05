import { z } from "zod"

import { isoDateTimeSchema } from "@/shared/lib/date"

import { permissionListSchema, type Permission } from "./permissions"

/** Kullanıcının veri kapsamı. Filtreyi backend uygular; UI yalnızca bilgilendirir. */
export const accessScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("org_units"), ids: z.array(z.string()) }),
  z.object({ kind: z.literal("locations"), ids: z.array(z.string()) }),
  z.object({ kind: z.literal("customers"), ids: z.array(z.string()) }),
])
export type AccessScope = z.infer<typeof accessScopeSchema>

export const supportSessionSchema = z.object({
  id: z.string(),
  tenantSlug: z.string(),
  agentName: z.string(),
  reason: z.string(),
  startedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
})
export type SupportSession = z.infer<typeof supportSessionSchema>

export const meSchema = z.object({
  user: z.object({
    id: z.string(),
    displayName: z.string(),
    email: z.string(),
    title: z.string().nullable(),
  }),
  tenantSlug: z.string(),
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  permissions: permissionListSchema,
  scope: accessScopeSchema,
  isPlatformAdmin: z.boolean(),
  /** Platform personeli destek amacıyla bu kiracıya geçtiyse dolu */
  supportSession: supportSessionSchema.nullable(),
})
export type Me = z.infer<typeof meSchema>

/** Yetki kontrolü: dizi verilirse herhangi biri yeterlidir. */
export function can(
  me: Pick<Me, "permissions"> | null | undefined,
  permission: Permission | readonly Permission[]
): boolean {
  if (!me) return false
  const required = typeof permission === "string" ? [permission] : permission
  return required.some((item) => me.permissions.includes(item))
}

/** `/me` 403 kodları */
export const SESSION_ERROR_CODES = {
  notProvisioned: "USER_NOT_PROVISIONED",
  disabled: "USER_DISABLED",
  supportRequired: "SUPPORT_SESSION_REQUIRED",
} as const
