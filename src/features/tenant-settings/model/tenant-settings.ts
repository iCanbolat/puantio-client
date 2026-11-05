import { z } from "zod"

import { tenantRulesSchema, terminologySchema } from "@/entities/tenant"
import { isHexColor } from "@/shared/lib/color"
import { isoDateTimeSchema } from "@/shared/lib/date"
import { listParamsSchema, paginatedSchema } from "@/shared/types"

export const tenantSettingsInputSchema = z.object({
  displayName: z.string().trim().min(3, "Firma adı girin").max(120),
  shortName: z.string().trim().min(2, "Kısa ad girin").max(24),
  branding: z.object({
    primaryColor: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || isHexColor(value),
        "Renk #RRGGBB biçiminde olmalı"
      )
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    logoUrl: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          /^https:\/\//.test(value) ||
          value.startsWith("data:image/"),
        "Logo adresi https:// ile başlamalı"
      )
      .transform((value) => (value === "" ? null : value))
      .nullable(),
  }),
  terminology: terminologySchema,
  rules: tenantRulesSchema,
})
export type TenantSettingsInput = z.input<typeof tenantSettingsInputSchema>
export type TenantSettingsPayload = z.output<typeof tenantSettingsInputSchema>

export const auditEventSchema = z.object({
  id: z.string(),
  occurredAt: isoDateTimeSchema,
  actorName: z.string(),
  actorKind: z.enum(["user", "platform", "system"]),
  action: z.string(),
  targetType: z.string(),
  targetLabel: z.string(),
  details: z.string().nullable(),
})
export type AuditEvent = z.infer<typeof auditEventSchema>
export const auditListSchema = paginatedSchema(auditEventSchema)

export const auditListParamsSchema = listParamsSchema.extend({
  actorKind: z.enum(["user", "platform", "system"]).optional().catch(undefined),
})
export type AuditListParams = z.infer<typeof auditListParamsSchema>

export const ACTOR_KIND_LABELS: Record<AuditEvent["actorKind"], string> = {
  user: "Kullanıcı",
  platform: "Puantio destek",
  system: "Sistem",
}
