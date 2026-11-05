import type { AuthAdapter, AuthSession } from "@/features/auth"
import type { TenantConfig } from "@/entities/tenant"
import { storageKey } from "@/shared/config/brand"
import { paths } from "@/shared/config/paths"
import { serverNow } from "@/shared/lib/server-time"
import { safeSession } from "@/shared/stores/safe-storage"

import { mintMockToken, parseMockToken } from "./token"

/** Mock kimlik: hangi kiracı (organization) ve hangi kullanıcı olarak giriş yapılacağı */
export interface MockIdentity {
  organization: string
  userId: string
  name?: string | null
  email?: string | null
}

interface StoredSession {
  identity: MockIdentity
  accessToken: string
  refreshExpiresAt: number
}

export interface MockAuthAdapterOptions {
  /** Giriş butonuna basıldığında kimin oturum açacağı (dev paneli seçimi, e-posta ipucu) */
  resolveIdentity: (hint: {
    loginHint: string | null
    idpHint: string | null
  }) => MockIdentity | null
  /** Sayfa açılırken oturum yoksa doğrudan açılacak kimlik (testler, E2E `?kullanici=`) */
  initialIdentity?: MockIdentity | null
  /** Access token ömrü (Keycloak varsayılanı 5 dk; mock 15 dk) */
  tokenLifetimeMs?: number
  /** Refresh token ömrü (Keycloak SSO Session Idle) */
  refreshLifetimeMs?: number
}

export type MockAuthAdapter = AuthAdapter & {
  signInAs: (identity: MockIdentity) => void
  /** Sonraki `refresh()` başarısız olur (refresh token süresi doldu) */
  expireRefresh: () => void
  /** Testler: giriş isteklerinin parametreleri */
  readonly loginCalls: { idpHint: string | null; loginHint: string | null }[]
}

/**
 * Yönlendirmesiz kimlik adaptörü (yalnızca mock modu ve testler). Keycloak'a gitmeden
 * dev panelinde seçilen kullanıcıyla oturum açar; token'ı MSW handler'ları çözer.
 * Oturum gerçek akıştaki gibi `sessionStorage`'dadır (sekme bazında).
 */
export function createMockAuthAdapter(
  tenant: TenantConfig,
  options: MockAuthAdapterOptions
): MockAuthAdapter {
  const key = storageKey("mock-auth", tenant.slug)
  const tokenLifetime = options.tokenLifetimeMs ?? 15 * 60_000
  const refreshLifetime = options.refreshLifetimeMs ?? 8 * 60 * 60_000
  let stored: StoredSession | null = null
  const loginCalls: MockAuthAdapter["loginCalls"] = []

  const persist = () => {
    if (stored) safeSession.set(key, JSON.stringify(stored))
    else safeSession.remove(key)
  }

  const open = (identity: MockIdentity, refreshExpiresAt?: number) => {
    const now = serverNow().getTime()
    stored = {
      identity,
      accessToken: mintMockToken({
        organization: identity.organization,
        userId: identity.userId,
        expiresAt: now + tokenLifetime,
      }),
      refreshExpiresAt: refreshExpiresAt ?? now + refreshLifetime,
    }
    persist()
  }

  const toSession = (value: StoredSession): AuthSession => {
    const claims = parseMockToken(value.accessToken)
    return {
      accessToken: value.accessToken,
      expiresAt: claims?.expiresAt ?? 0,
      profile: {
        subject: value.identity.userId,
        organization: value.identity.organization,
        name: value.identity.name ?? null,
        email: value.identity.email ?? null,
      },
    }
  }

  return {
    kind: "mock",
    loginCalls,
    init() {
      const raw = safeSession.get(key)
      if (raw) {
        try {
          stored = JSON.parse(raw) as StoredSession
        } catch {
          stored = null
        }
      }
      if (!stored && options.initialIdentity) open(options.initialIdentity)
      return Promise.resolve()
    },
    getSession() {
      return stored ? toSession(stored) : null
    },
    login({ returnTo, idpHint, loginHint }) {
      loginCalls.push({
        idpHint: idpHint ?? null,
        loginHint: loginHint ?? null,
      })
      const identity = options.resolveIdentity({
        idpHint: idpHint ?? null,
        loginHint: loginHint ?? null,
      })
      if (!identity) return Promise.reject(new Error("Mock kimlik bulunamadı"))
      open(identity)
      return Promise.resolve({ kind: "completed", returnTo })
    },
    completeLogin() {
      return Promise.resolve({ returnTo: paths.home() })
    },
    refresh() {
      if (!stored || stored.refreshExpiresAt <= serverNow().getTime()) {
        return Promise.resolve(false)
      }
      open(stored.identity, stored.refreshExpiresAt)
      return Promise.resolve(true)
    },
    logout() {
      stored = null
      persist()
      return Promise.resolve({
        kind: "completed",
        returnTo: paths.login({ reason: "cikis" }),
      })
    },
    signInAs(identity) {
      open(identity)
    },
    expireRefresh() {
      if (stored) {
        stored.refreshExpiresAt = 0
        persist()
      }
    },
  }
}
