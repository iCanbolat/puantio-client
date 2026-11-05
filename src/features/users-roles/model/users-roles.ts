import { z } from "zod"

import {
  SENSITIVE_PERMISSIONS,
  accessScopeSchema,
  isPermission,
  permissionListSchema,
  type Permission,
} from "@/entities/session"
import { isoDateTimeSchema } from "@/shared/lib/date"
import { listParamsSchema, paginatedSchema } from "@/shared/types"

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.enum(["system", "custom"]),
  templateKey: z.string().nullable(),
  permissions: permissionListSchema,
  userCount: z.number().int().min(0),
})
export type Role = z.infer<typeof roleSchema>
export const roleListSchema = z.object({ items: z.array(roleSchema) })

export const roleInputSchema = z.object({
  name: z.string().trim().min(2, "Rol adı girin").max(60),
  description: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  permissions: z
    .array(
      z.custom<Permission>(
        (value) => typeof value === "string" && isPermission(value),
        "Bilinmeyen yetki"
      )
    )
    .min(1, "En az bir yetki seçin")
    .refine(
      (items) => !items.some((item) => SENSITIVE_PERMISSIONS.includes(item)),
      "Sağlık verisi yetkileri yalnızca İSG uzmanı sistem rolüne bağlanabilir"
    ),
})
export type RoleInput = z.input<typeof roleInputSchema>
export type RolePayload = z.output<typeof roleInputSchema>

export const USER_STATUSES = ["invited", "active", "disabled"] as const
export const userStatusSchema = z.enum(USER_STATUSES)
export type UserStatus = z.infer<typeof userStatusSchema>
export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  invited: "Davet edildi",
  active: "Aktif",
  disabled: "Devre dışı",
}

export const tenantUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  title: z.string().nullable(),
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  scope: accessScopeSchema,
  status: userStatusSchema,
  lastLoginAt: isoDateTimeSchema.nullable(),
  invitedAt: isoDateTimeSchema.nullable(),
})
export type TenantUser = z.infer<typeof tenantUserSchema>
export const tenantUserListSchema = paginatedSchema(tenantUserSchema)

export const userListParamsSchema = listParamsSchema.extend({
  sort: z
    .enum(["displayName", "email", "lastLoginAt"])
    .optional()
    .catch(undefined),
  status: userStatusSchema.optional().catch(undefined),
  roleId: z.string().min(1).optional().catch(undefined),
})
export type UserListParams = z.infer<typeof userListParamsSchema>

export const SCOPE_KINDS = [
  "all",
  "org_units",
  "locations",
  "customers",
] as const
export type ScopeKind = (typeof SCOPE_KINDS)[number]

const scopeInputSchema = accessScopeSchema.refine(
  (scope) => scope.kind === "all" || scope.ids.length > 0,
  { message: "Kapsam için en az bir kayıt seçin" }
)

export const userInviteSchema = z.object({
  email: z.email("Geçerli bir e-posta girin").trim().toLowerCase(),
  displayName: z.string().trim().min(3, "Ad soyad girin").max(80),
  title: z
    .string()
    .trim()
    .max(80)
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  roleIds: z.array(z.string()).min(1, "En az bir rol seçin"),
  scope: scopeInputSchema,
})
export type UserInviteInput = z.input<typeof userInviteSchema>
export type UserInvitePayload = z.output<typeof userInviteSchema>

export const userUpdateSchema = userInviteSchema.omit({ email: true })
export type UserUpdateInput = z.input<typeof userUpdateSchema>
export type UserUpdatePayload = z.output<typeof userUpdateSchema>
