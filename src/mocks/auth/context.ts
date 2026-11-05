import type { HttpResponseResolver, PathParams } from "msw"

import {
  SESSION_ERROR_CODES,
  type AccessScope,
  type Permission,
} from "@/entities/session"
import { descendantIds } from "@/entities/org-unit"

import { mockClock } from "../clock"
import { db } from "../db"
import type { MockLocation, MockSupportSession, MockUser } from "../db/types"
import { problem } from "../http"
import { PLATFORM_ROLE, SUPPORT_PERMISSIONS } from "../tenancy/roles"
import type { MockTenant } from "../tenancy/tenants"
import { PLATFORM_AGENT } from "../tenancy/users"
import { parseMockToken } from "./token"

export const PLATFORM_ORG = "platform"
export const UNPROVISIONED_USER_ID = "kayitsiz"

export interface AuthContext {
  tenant: MockTenant
  /** Kiracı kullanıcısı; platform personelinde `null` */
  user: MockUser | null
  actorName: string
  actorId: string
  permissions: Set<Permission>
  scope: AccessScope
  support: MockSupportSession | null
  isPlatform: boolean
}

type AuthResult =
  { ok: true; context: AuthContext } | { ok: false; response: Response }

const fail = (response: Response): AuthResult => ({ ok: false, response })

function activeSupportSession(tenantSlug: string, agentId: string) {
  const now = mockClock.now().getTime()
  return (
    db.supportSessions.findFirst(
      (session) =>
        session.tenantSlug === tenantSlug &&
        session.agentUserId === agentId &&
        session.endedAt === null &&
        Date.parse(session.expiresAt) > now
    ) ?? null
  )
}

/**
 * İsteği doğrular: Bearer token → kiracı + kullanıcı + yetkiler. Gerçek backend'de kiracı
 * Host başlığından ve token'daki organization'dan çözülür; mock'ta token belirleyicidir.
 */
export function authenticate(request: Request): AuthResult {
  const header = request.headers.get("Authorization") ?? ""
  const claims = header.startsWith("Bearer ")
    ? parseMockToken(header.slice(7))
    : null
  if (!claims) {
    return fail(problem(401, "UNAUTHENTICATED", "Oturum açmanız gerekiyor."))
  }
  if (claims.expiresAt <= mockClock.now().getTime()) {
    return fail(problem(401, "TOKEN_EXPIRED", "Oturumunuzun süresi doldu."))
  }

  if (claims.organization === PLATFORM_ORG) {
    const supportTenant = request.headers.get("x-support-tenant")
    if (supportTenant) {
      const tenant = db.tenants.findById(supportTenant)
      if (!tenant)
        return fail(problem(404, "TENANT_NOT_FOUND", "Firma bulunamadı."))
      const support = activeSupportSession(supportTenant, claims.userId)
      if (!support) {
        return fail(
          problem(
            403,
            SESSION_ERROR_CODES.supportRequired,
            "Bu firmada etkin destek oturumunuz yok."
          )
        )
      }
      return {
        ok: true,
        context: {
          tenant,
          user: null,
          actorName: support.agentName,
          actorId: claims.userId,
          permissions: new Set(SUPPORT_PERMISSIONS),
          scope: { kind: "all" },
          support,
          isPlatform: true,
        },
      }
    }
    const platform = db.tenants.findById(PLATFORM_ORG)!
    return {
      ok: true,
      context: {
        tenant: platform,
        user: null,
        actorName: PLATFORM_AGENT.displayName,
        actorId: claims.userId,
        permissions: new Set(PLATFORM_ROLE.permissions),
        scope: { kind: "all" },
        support: null,
        isPlatform: true,
      },
    }
  }

  const tenant = db.tenants.findById(claims.organization)
  if (!tenant)
    return fail(problem(404, "TENANT_NOT_FOUND", "Firma bulunamadı."))
  const user = db.users.findFirst(
    (item) => item.tenantId === tenant.slug && item.id === claims.userId
  )
  if (!user) {
    return fail(
      problem(
        403,
        SESSION_ERROR_CODES.notProvisioned,
        "Hesabınız bu firmada tanımlı değil."
      )
    )
  }
  if (user.status === "disabled") {
    return fail(
      problem(403, SESSION_ERROR_CODES.disabled, "Hesabınız devre dışı.")
    )
  }
  const permissions = new Set<Permission>()
  for (const roleId of user.roleIds) {
    const role = db.roles.findById(roleId)
    role?.permissions.forEach((permission) => permissions.add(permission))
  }
  return {
    ok: true,
    context: {
      tenant,
      user,
      actorName: user.displayName,
      actorId: user.id,
      permissions,
      scope: user.scope,
      support: null,
      isPlatform: false,
    },
  }
}

type Args<TParams extends PathParams> = Parameters<
  HttpResponseResolver<TParams>
>[0]

/**
 * Yetkili handler: token doğrular, yetki yoksa 403 döner. Kiracı tarafı uçlar platform
 * kiracısında (destek oturumu olmadan) çağrılamaz.
 */
export function withAuth<TParams extends PathParams = PathParams>(
  permission: Permission | null,
  resolver: (
    args: Args<TParams> & { auth: AuthContext }
  ) => Response | Promise<Response>
) {
  return (args: Args<TParams>) => {
    const result = authenticate(args.request)
    if (!result.ok) return result.response
    if (permission && !result.context.permissions.has(permission)) {
      return problem(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.")
    }
    return resolver({ ...args, auth: result.context })
  }
}

/** Kapsam filtresi: bölge sorumlusu yalnızca kendi bölgelerini, süpervizör kendi lokasyonlarını görür. */
export function createScope(auth: AuthContext) {
  const tenantId = auth.tenant.slug
  const scope = auth.scope
  let allowedUnits: Set<string> | null = null
  if (scope.kind === "org_units") {
    const units = db.orgUnits.findMany((unit) => unit.tenantId === tenantId)
    allowedUnits = new Set(
      scope.ids.flatMap((id) => [...descendantIds(units, id)])
    )
  }
  const locationIds = scope.kind === "locations" ? new Set(scope.ids) : null
  const customerIds = scope.kind === "customers" ? new Set(scope.ids) : null

  const location = (item: MockLocation) => {
    if (item.tenantId !== tenantId) return false
    if (allowedUnits) return allowedUnits.has(item.orgUnitId)
    if (locationIds) return locationIds.has(item.id)
    if (customerIds) return customerIds.has(item.customerId)
    return true
  }

  return {
    tenantId,
    location,
    locationId: (id: string | null) => {
      if (!id) return scope.kind === "all"
      const found = db.locations.findById(id)
      return found ? location(found) : false
    },
    /** Personel ana lokasyonu kapsamdaysa görünür; yedek havuzu yalnızca tüm kapsamda */
    personnel: (item: { tenantId: string; homeLocationId: string | null }) => {
      if (item.tenantId !== tenantId) return false
      if (scope.kind === "all") return true
      if (!item.homeLocationId) return allowedUnits !== null
      const found = db.locations.findById(item.homeLocationId)
      return found ? location(found) : false
    },
    customer: (item: { id: string; tenantId: string }) => {
      if (item.tenantId !== tenantId) return false
      if (scope.kind === "all") return true
      if (customerIds) return customerIds.has(item.id)
      return (
        db.locations.count(
          (loc) => loc.customerId === item.id && location(loc)
        ) > 0
      )
    },
  }
}

export function audit(
  auth: AuthContext,
  event: {
    action: string
    targetType: string
    targetLabel: string
    details?: string | null
  }
): void {
  db.auditEvents.insert({
    id: `aud-${crypto.randomUUID()}`,
    tenantId: auth.tenant.slug,
    occurredAt: mockClock.now().toISOString(),
    actorName: auth.actorName,
    actorKind: auth.isPlatform ? "platform" : "user",
    action: event.action,
    targetType: event.targetType,
    targetLabel: event.targetLabel,
    details: event.details ?? null,
  })
}
