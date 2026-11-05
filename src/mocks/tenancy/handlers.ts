import { http } from "msw"
import { z } from "zod"

import { SENSITIVE_PERMISSIONS, type Me } from "@/entities/session"
import {
  auditListParamsSchema,
  tenantSettingsInputSchema,
} from "@/features/tenant-settings/model/tenant-settings"
import {
  roleInputSchema,
  userInviteSchema,
  userListParamsSchema,
  userUpdateSchema,
} from "@/features/users-roles/model/users-roles"

import { audit, authenticate, withAuth } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockUser } from "../db/types"
import {
  apiPath,
  created,
  noContent,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import { persistSupportSessions } from "../platform/persistence"
import { PLATFORM_ROLE, type MockRole } from "./roles"
import { toTenantConfig } from "./tenants"
import { PLATFORM_AGENT } from "./users"

function serializeRole(role: MockRole) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    kind: role.kind,
    templateKey: role.templateKey,
    permissions: role.permissions,
    userCount: db.users.count(
      (user) =>
        user.tenantId === role.tenantId && user.roleIds.includes(role.id)
    ),
  }
}

function serializeUser(user: MockUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    title: user.title,
    roles: user.roleIds.flatMap((id) => {
      const role = db.roles.findById(id)
      return role ? [{ id: role.id, name: role.name }] : []
    }),
    scope: user.scope,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    invitedAt: user.invitedAt,
  }
}

export const tenancyHandlers = [
  http.get(apiPath("/public/tenant-config"), ({ request }) => {
    const { tenant: slug } = parseQuery(
      request,
      z.object({ tenant: z.string().optional() })
    )
    const tenant = slug ? db.tenants.findById(slug) : undefined
    if (!tenant) return notFound("Firma bulunamadı.")
    return ok(toTenantConfig(tenant))
  }),

  http.get(apiPath("/me"), ({ request }) => {
    const result = authenticate(request)
    if (!result.ok) return result.response
    const { context } = result
    if (
      context.isPlatform &&
      !context.support &&
      context.tenant.kind !== "platform"
    ) {
      return problem(403, "SUPPORT_SESSION_REQUIRED", "Destek oturumu yok.")
    }
    const me: Me = context.user
      ? {
          user: {
            id: context.user.id,
            displayName: context.user.displayName,
            email: context.user.email,
            title: context.user.title,
          },
          tenantSlug: context.tenant.slug,
          roles: serializeUser(context.user).roles,
          permissions: [...context.permissions],
          scope: context.scope,
          isPlatformAdmin: false,
          supportSession: null,
        }
      : {
          user: {
            id: PLATFORM_AGENT.id,
            displayName: PLATFORM_AGENT.displayName,
            email: PLATFORM_AGENT.email,
            title: PLATFORM_AGENT.title,
          },
          tenantSlug: context.tenant.slug,
          roles: [
            context.support
              ? { id: "destek", name: "Destek oturumu (salt okunur)" }
              : { id: PLATFORM_ROLE.id, name: PLATFORM_ROLE.name },
          ],
          permissions: [...context.permissions],
          scope: context.scope,
          isPlatformAdmin: true,
          supportSession: context.support
            ? {
                id: context.support.id,
                tenantSlug: context.support.tenantSlug,
                agentName: context.support.agentName,
                reason: context.support.reason,
                startedAt: context.support.startedAt,
                expiresAt: context.support.expiresAt,
              }
            : null,
        }
    if (context.user) {
      db.users.update(context.user.id, {
        lastLoginAt: mockClock.now().toISOString(),
      })
    }
    return ok(me)
  }),

  http.post(
    apiPath("/support-sessions/current/end"),
    withAuth(null, ({ auth }) => {
      if (!auth.support) return notFound("Açık destek oturumu yok.")
      db.supportSessions.update(auth.support.id, {
        endedAt: mockClock.now().toISOString(),
      })
      persistSupportSessions()
      audit(auth, {
        action: "Destek oturumu bitirildi",
        targetType: "support",
        targetLabel: auth.support.agentName,
      })
      return noContent()
    })
  ),

  http.patch(
    apiPath("/tenant/settings"),
    withAuth("tenant:settings", async ({ request, auth }) => {
      const body = await parseBody(request, tenantSettingsInputSchema)
      if (!body.success) return body.response
      const current = db.tenants.findById(auth.tenant.slug)!
      const updated = db.tenants.update(current.id, {
        displayName: body.data.displayName,
        shortName: body.data.shortName,
        branding: {
          ...current.branding,
          primaryColor: body.data.branding.primaryColor,
          logoUrl: body.data.branding.logoUrl,
        },
        terminology: body.data.terminology,
        rules: body.data.rules,
      })!
      audit(auth, {
        action: "Firma ayarları güncellendi",
        targetType: "tenant",
        targetLabel: updated.displayName,
      })
      return ok(toTenantConfig(updated))
    })
  ),

  http.get(
    apiPath("/audit-events"),
    withAuth("audit:read", ({ request, auth }) => {
      const params = parseQuery(request, auditListParamsSchema)
      const page = db.auditEvents.query(params, {
        where: (event) =>
          event.tenantId === auth.tenant.slug &&
          (!params.actorKind || event.actorKind === params.actorKind),
        searchFields: ["actorName", "action", "targetLabel"],
        defaultSort: { field: "occurredAt", order: "desc" },
      })
      return ok({
        items: page.items.map(({ tenantId: _tenantId, ...event }) => event),
        meta: page.meta,
      })
    })
  ),

  // --- Roller ---------------------------------------------------------------
  http.get(
    apiPath("/roles"),
    withAuth(null, ({ auth }) => {
      if (
        !auth.permissions.has("user:read") &&
        !auth.permissions.has("role:write")
      )
        return problem(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.")
      const roles = db.roles
        .findMany((role) => role.tenantId === auth.tenant.slug)
        .sort((a, b) =>
          a.kind === b.kind
            ? a.name.localeCompare(b.name, "tr")
            : a.kind === "system"
              ? -1
              : 1
        )
      return ok({ items: roles.map(serializeRole) })
    })
  ),

  http.post(
    apiPath("/roles"),
    withAuth("role:write", async ({ request, auth }) => {
      const body = await parseBody(request, roleInputSchema)
      if (!body.success) return body.response
      const duplicate = db.roles.findFirst(
        (role) =>
          role.tenantId === auth.tenant.slug &&
          role.name.localeCompare(body.data.name, "tr", {
            sensitivity: "base",
          }) === 0
      )
      if (duplicate) {
        return problem(422, "VALIDATION_FAILED", "Formda hatalı alanlar var.", {
          name: ["Bu adla bir rol zaten var."],
        })
      }
      const role = db.roles.insert({
        id: newId("rol"),
        tenantId: auth.tenant.slug,
        name: body.data.name,
        description: body.data.description,
        kind: "custom",
        templateKey: null,
        permissions: body.data.permissions,
      })
      audit(auth, {
        action: "Rol oluşturuldu",
        targetType: "role",
        targetLabel: role.name,
      })
      return created(serializeRole(role))
    })
  ),

  http.patch(
    apiPath("/roles/:id"),
    withAuth("role:write", async ({ request, params, auth }) => {
      const role = db.roles.findById(String(params.id))
      if (!role || role.tenantId !== auth.tenant.slug) return notFound()
      if (role.kind === "system")
        return problem(
          409,
          "SYSTEM_ROLE",
          "Sistem rolleri değiştirilemez; kopyalayıp özel rol oluşturun."
        )
      const body = await parseBody(request, roleInputSchema)
      if (!body.success) return body.response
      if (
        body.data.permissions.some((item) =>
          SENSITIVE_PERMISSIONS.includes(item)
        )
      ) {
        return problem(422, "VALIDATION_FAILED", "Formda hatalı alanlar var.", {
          permissions: ["Sağlık verisi yetkileri özel role atanamaz."],
        })
      }
      const updated = db.roles.update(role.id, body.data)!
      audit(auth, {
        action: "Rol yetkileri güncellendi",
        targetType: "role",
        targetLabel: updated.name,
        details: `${updated.permissions.length} yetki`,
      })
      return ok(serializeRole(updated))
    })
  ),

  http.delete(
    apiPath("/roles/:id"),
    withAuth("role:write", ({ params, auth }) => {
      const role = db.roles.findById(String(params.id))
      if (!role || role.tenantId !== auth.tenant.slug) return notFound()
      if (role.kind === "system")
        return problem(409, "SYSTEM_ROLE", "Sistem rolleri silinemez.")
      if (db.users.count((user) => user.roleIds.includes(role.id)) > 0)
        return problem(
          409,
          "ROLE_IN_USE",
          "Bu rol kullanıcılara atanmış; önce kullanıcılardan kaldırın."
        )
      db.roles.remove(role.id)
      audit(auth, {
        action: "Rol silindi",
        targetType: "role",
        targetLabel: role.name,
      })
      return noContent()
    })
  ),

  // --- Kullanıcılar ---------------------------------------------------------
  http.get(
    apiPath("/users"),
    withAuth("user:read", ({ request, auth }) => {
      const params = parseQuery(request, userListParamsSchema)
      const page = db.users.query(params, {
        where: (user) =>
          user.tenantId === auth.tenant.slug &&
          (!params.status || user.status === params.status) &&
          (!params.roleId || user.roleIds.includes(params.roleId)),
        searchFields: ["displayName", "email"],
        sortableFields: ["displayName", "email", "lastLoginAt"],
        defaultSort: { field: "displayName", order: "asc" },
      })
      return ok({ items: page.items.map(serializeUser), meta: page.meta })
    })
  ),

  http.post(
    apiPath("/users/invitations"),
    withAuth("user:write", async ({ request, auth }) => {
      const body = await parseBody(request, userInviteSchema)
      if (!body.success) return body.response
      const exists = db.users.findFirst(
        (user) =>
          user.tenantId === auth.tenant.slug && user.email === body.data.email
      )
      if (exists) {
        return problem(422, "VALIDATION_FAILED", "Formda hatalı alanlar var.", {
          email: ["Bu e-posta ile bir kullanıcı zaten var."],
        })
      }
      const user = db.users.insert({
        id: newId("u"),
        tenantId: auth.tenant.slug,
        displayName: body.data.displayName,
        email: body.data.email,
        title: body.data.title,
        roleIds: body.data.roleIds,
        scope: body.data.scope,
        status: "invited",
        lastLoginAt: null,
        invitedAt: mockClock.now().toISOString(),
      })
      audit(auth, {
        action: "Kullanıcı davet edildi",
        targetType: "user",
        targetLabel: user.email,
      })
      return created(serializeUser(user))
    })
  ),

  http.patch(
    apiPath("/users/:id"),
    withAuth("user:write", async ({ request, params, auth }) => {
      const user = db.users.findById(String(params.id))
      if (!user || user.tenantId !== auth.tenant.slug) return notFound()
      const body = await parseBody(request, userUpdateSchema)
      if (!body.success) return body.response
      const updated = db.users.update(user.id, body.data)!
      audit(auth, {
        action: "Kullanıcı rol/kapsam güncellendi",
        targetType: "user",
        targetLabel: updated.email,
      })
      return ok(serializeUser(updated))
    })
  ),

  http.post(
    apiPath("/users/:id/status"),
    withAuth("user:write", async ({ request, params, auth }) => {
      const user = db.users.findById(String(params.id))
      if (!user || user.tenantId !== auth.tenant.slug) return notFound()
      const body = await parseBody(
        request,
        z.object({ status: z.enum(["active", "disabled"]) })
      )
      if (!body.success) return body.response
      if (auth.user?.id === user.id)
        return problem(
          409,
          "SELF_DISABLE",
          "Kendi hesabınızı devre dışı bırakamazsınız."
        )
      const updated = db.users.update(user.id, { status: body.data.status })!
      audit(auth, {
        action:
          body.data.status === "disabled"
            ? "Kullanıcı devre dışı bırakıldı"
            : "Kullanıcı etkinleştirildi",
        targetType: "user",
        targetLabel: updated.email,
      })
      return ok(serializeUser(updated))
    })
  ),
]
