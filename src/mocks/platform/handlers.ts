import { http } from "msw"

import {
  createTenantSchema,
  startSupportSchema,
  updateTenantSchema,
} from "@/features/platform-admin/model/platform"

import { withAuth } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockSupportSession } from "../db/types"
import { apiPath, created, notFound, ok, parseBody, problem } from "../http"
import { buildSystemRoles } from "../tenancy/roles"
import type { MockTenant } from "../tenancy/tenants"
import { persistSupportSessions } from "./persistence"
import { PLATFORM_AGENT } from "../tenancy/users"

function serializeTenant(tenant: MockTenant) {
  return {
    slug: tenant.slug,
    displayName: tenant.displayName,
    shortName: tenant.shortName,
    status: tenant.status,
    modules: tenant.modules,
    serviceLines: tenant.serviceLines,
    userCount: db.users.count((user) => user.tenantId === tenant.slug),
    personnelCount: db.personnel.count(
      (person) => person.tenantId === tenant.slug
    ),
    locationCount: db.locations.count(
      (location) => location.tenantId === tenant.slug
    ),
    adminEmail: tenant.adminEmail,
    createdAt: tenant.createdAt,
  }
}

const serializeSession = (session: MockSupportSession) => ({
  id: session.id,
  tenantSlug: session.tenantSlug,
  agentName: session.agentName,
  reason: session.reason,
  startedAt: session.startedAt,
  expiresAt: session.expiresAt,
  endedAt: session.endedAt,
})

export const platformHandlers = [
  http.get(
    apiPath("/platform/tenants"),
    withAuth("platform:tenants", () =>
      ok({
        items: db.tenants
          .findMany((tenant) => tenant.kind === "tenant")
          .map(serializeTenant),
      })
    )
  ),
  http.get(
    apiPath("/platform/tenants/:slug"),
    withAuth("platform:tenants", ({ params }) => {
      const tenant = db.tenants.findById(String(params.slug))
      if (!tenant || tenant.kind !== "tenant")
        return notFound("Firma bulunamadı.")
      return ok(serializeTenant(tenant))
    })
  ),
  http.post(
    apiPath("/platform/tenants"),
    withAuth("platform:tenants", async ({ request }) => {
      const body = await parseBody(request, createTenantSchema)
      if (!body.success) return body.response
      if (db.tenants.findById(body.data.slug)) {
        return problem(422, "VALIDATION_FAILED", "Formda hatalı alanlar var.", {
          slug: ["Bu alt alan adı kullanılıyor."],
        })
      }
      const orgLevels =
        body.data.orgLevelCount === 2
          ? [
              { singular: "Bölge", plural: "Bölgeler" },
              { singular: "Alt bölge", plural: "Alt bölgeler" },
            ]
          : [{ singular: "Bölge", plural: "Bölgeler" }]
      const tenant = db.tenants.insert({
        id: body.data.slug,
        slug: body.data.slug,
        kind: "tenant",
        status: "active",
        displayName: body.data.displayName,
        shortName: body.data.shortName,
        branding: { logoUrl: null, primaryColor: null, faviconUrl: null },
        auth: {
          issuer: "https://auth.puantio.com/realms/puantio",
          clientId: "puantio-web",
          organization: body.data.slug,
          providers: [
            {
              id: "password",
              kind: "password",
              label: "E-posta ile giriş yap",
              idpHint: null,
              domains: [],
            },
          ],
        },
        modules: body.data.modules,
        terminology: {
          orgLevels,
          location: { singular: "Lokasyon", plural: "Lokasyonlar" },
          area: { singular: "Alan", plural: "Alanlar" },
        },
        serviceLines: body.data.serviceLines,
        rules: {
          idleTimeoutMinutes: 30,
          lateToleranceMinutes: 10,
          alarmSlaMinutes: 15,
          geofence: { min: 25, max: 1000, default: 100 },
        },
        createdAt: mockClock.now().toISOString(),
        adminEmail: body.data.adminEmail,
      })
      db.roles.insertMany(buildSystemRoles(tenant.slug))
      db.users.insert({
        id: newId("u"),
        tenantId: tenant.slug,
        displayName: body.data.adminName,
        email: body.data.adminEmail,
        title: "Firma yöneticisi",
        roleIds: [
          `rol-${tenant.slug}-tenant_admin`,
          `rol-${tenant.slug}-super_admin`,
        ],
        scope: { kind: "all" },
        status: "invited",
        lastLoginAt: null,
        invitedAt: mockClock.now().toISOString(),
      })
      return created(serializeTenant(tenant))
    })
  ),
  http.patch(
    apiPath("/platform/tenants/:slug"),
    withAuth("platform:tenants", async ({ request, params }) => {
      const tenant = db.tenants.findById(String(params.slug))
      if (!tenant || tenant.kind !== "tenant")
        return notFound("Firma bulunamadı.")
      const body = await parseBody(request, updateTenantSchema)
      if (!body.success) return body.response
      const patch: Partial<MockTenant> = {}
      if (body.data.modules) {
        if (!body.data.modules.includes("core"))
          return problem(
            422,
            "VALIDATION_FAILED",
            "Formda hatalı alanlar var.",
            {
              modules: ["Çekirdek modül kapatılamaz."],
            }
          )
        patch.modules = body.data.modules
      }
      if (body.data.status) patch.status = body.data.status
      const updated = db.tenants.update(tenant.id, patch)!
      return ok(serializeTenant(updated))
    })
  ),
  http.get(
    apiPath("/platform/support-sessions"),
    withAuth("platform:support", () =>
      ok({
        items: db.supportSessions
          .findMany()
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .map(serializeSession),
      })
    )
  ),
  http.post(
    apiPath("/platform/tenants/:slug/support-sessions"),
    withAuth("platform:support", async ({ request, params, auth }) => {
      const tenant = db.tenants.findById(String(params.slug))
      if (!tenant || tenant.kind !== "tenant")
        return notFound("Firma bulunamadı.")
      const body = await parseBody(request, startSupportSchema)
      if (!body.success) return body.response
      const startedAt = mockClock.now()
      // Aynı firmada açık oturum varsa kapatılır
      for (const open of db.supportSessions.findMany(
        (session) =>
          session.tenantSlug === tenant.slug &&
          session.agentUserId === auth.actorId &&
          session.endedAt === null
      )) {
        db.supportSessions.update(open.id, { endedAt: startedAt.toISOString() })
      }
      const session = db.supportSessions.insert({
        id: newId("sup"),
        tenantSlug: tenant.slug,
        agentUserId: auth.actorId,
        agentName: PLATFORM_AGENT.displayName,
        reason: body.data.reason,
        startedAt: startedAt.toISOString(),
        expiresAt: new Date(
          startedAt.getTime() + body.data.durationMinutes * 60_000
        ).toISOString(),
        endedAt: null,
      })
      db.auditEvents.insert({
        id: newId("aud"),
        tenantId: tenant.slug,
        occurredAt: startedAt.toISOString(),
        actorName: PLATFORM_AGENT.displayName,
        actorKind: "platform",
        action: "Destek oturumu başlatıldı",
        targetType: "support",
        targetLabel: tenant.displayName,
        details: `Gerekçe: ${body.data.reason} · ${body.data.durationMinutes} dk`,
      })
      persistSupportSessions()
      return created(serializeSession(session))
    })
  ),
  http.post(
    apiPath("/platform/support-sessions/:id/end"),
    withAuth("platform:support", ({ params }) => {
      const session = db.supportSessions.findById(String(params.id))
      if (!session) return notFound()
      const updated = db.supportSessions.update(session.id, {
        endedAt: session.endedAt ?? mockClock.now().toISOString(),
      })!
      persistSupportSessions()
      return ok(serializeSession(updated))
    })
  ),
]
