import {
  UserManager,
  WebStorageStateStore,
  type IdTokenClaims,
  type User,
} from "oidc-client-ts"

import type { TenantConfig } from "@/entities/tenant"
import { paths } from "@/shared/config/paths"

import type {
  AuthAdapter,
  AuthSession,
  AuthSessionProfile,
} from "../model/auth-adapter"

/**
 * Keycloak 26 `organization` kapsamı token'a üyelikleri ekler. Mapper ayarına göre
 * dizi (`["acme"]`), nesne (`{ acme: {...} }`) veya tek değer gelebilir.
 */
export function readOrganization(
  claims: IdTokenClaims | Record<string, unknown>
) {
  const value = (claims as Record<string, unknown>).organization
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const first: unknown = value[0]
    return typeof first === "string" ? first : ""
  }
  if (value && typeof value === "object") return Object.keys(value)[0] ?? ""
  return ""
}

export function toAuthSession(user: User): AuthSession {
  const profile: AuthSessionProfile = {
    subject: user.profile.sub,
    organization: readOrganization(user.profile),
    name: user.profile.name ?? user.profile.preferred_username ?? null,
    email: user.profile.email ?? null,
  }
  return {
    accessToken: user.access_token,
    expiresAt: (user.expires_at ?? 0) * 1000,
    profile,
  }
}

function readReturnTo(state: unknown): string {
  if (state && typeof state === "object" && "returnTo" in state) {
    const value = state.returnTo
    if (typeof value === "string" && value.startsWith("/")) return value
  }
  return paths.home()
}

/**
 * Keycloak OIDC adaptörü: Authorization Code + PKCE, redirect akışı (mobilde popup
 * güvenilmez). Token'lar `sessionStorage`'da tutulur; localStorage'a yazılmaz.
 * Sessiz yenileme otomatik değildir: `http` istemcisi 401'de `refresh()` çağırır.
 */
export function createOidcAuthAdapter(
  tenant: TenantConfig,
  options: { origin?: string; store?: Storage } = {}
): AuthAdapter {
  const origin = options.origin ?? window.location.origin
  const manager = new UserManager({
    authority: tenant.auth.issuer,
    client_id: tenant.auth.clientId,
    redirect_uri: `${origin}${paths.loginCallback()}`,
    post_logout_redirect_uri: `${origin}${paths.login({ reason: "cikis" })}`,
    response_type: "code",
    scope: "openid profile email organization",
    userStore: new WebStorageStateStore({
      store: options.store ?? window.sessionStorage,
    }),
    automaticSilentRenew: false,
    monitorSession: false,
  })
  let user: User | null = null

  return {
    kind: "oidc",
    async init() {
      user = await manager.getUser()
    },
    getSession() {
      return user ? toAuthSession(user) : null
    },
    async login({ returnTo, idpHint, loginHint }) {
      await manager.signinRedirect({
        state: { returnTo },
        ...(loginHint ? { login_hint: loginHint } : {}),
        extraQueryParams: idpHint ? { kc_idp_hint: idpHint } : {},
      })
      return { kind: "redirect" }
    },
    async completeLogin(url) {
      user = await manager.signinRedirectCallback(url)
      return { returnTo: readReturnTo(user.state) }
    },
    async refresh() {
      try {
        user = await manager.signinSilent()
        return user !== null
      } catch {
        return false
      }
    },
    async logout({ redirect }) {
      const idToken = user?.id_token
      user = null
      if (redirect) {
        await manager.signoutRedirect(
          idToken ? { id_token_hint: idToken } : undefined
        )
        return { kind: "redirect" }
      }
      await manager.removeUser()
      return { kind: "completed", returnTo: paths.login({ reason: "cikis" }) }
    },
  }
}
