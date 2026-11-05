import type { TenantConfig } from "@/entities/tenant"
import { storageKey } from "@/shared/config/brand"

import {
  PLATFORM_ORGANIZATION,
  type AuthAdapter,
  type AuthAdapterFactory,
  type AuthFlowResult,
  type AuthSession,
  type LoginOptions,
} from "../model/auth-adapter"

type Listener = () => void

const LOGOUT_MESSAGE = "logout"

/**
 * Uygulamanın tek kimlik giriş noktası. Kiracı yapılandırması yüklendikten sonra
 * `initialize` ile adaptör (Keycloak / mock) oluşturulur. Sekmeler arası çıkış senkronu
 * BroadcastChannel ile yapılır.
 */
export function createAuthController(factory: AuthAdapterFactory) {
  let adapter: AuthAdapter | null = null
  let tenant: TenantConfig | null = null
  let channel: BroadcastChannel | null = null
  const remoteLogoutListeners = new Set<Listener>()

  const requireAdapter = () => {
    if (!adapter) throw new Error("Kimlik doğrulama henüz başlatılmadı")
    return adapter
  }

  const openChannel = (slug: string) => {
    channel?.close()
    channel = null
    if (typeof BroadcastChannel === "undefined") return
    channel = new BroadcastChannel(storageKey("auth", slug))
    channel.onmessage = (event: MessageEvent) => {
      if (event.data !== LOGOUT_MESSAGE) return
      void adapter?.logout({ redirect: false }).finally(() => {
        remoteLogoutListeners.forEach((listener) => {
          listener()
        })
      })
    }
  }

  return {
    async initialize(config: TenantConfig): Promise<void> {
      if (adapter && tenant?.slug === config.slug) return
      tenant = config
      adapter = factory(config)
      await adapter.init()
      openChannel(config.slug)
    },
    get isInitialized() {
      return adapter !== null
    },
    get adapterKind() {
      return adapter?.kind ?? null
    },
    getSession(): AuthSession | null {
      return adapter?.getSession() ?? null
    },
    getAccessToken(): string | null {
      return adapter?.getSession()?.accessToken ?? null
    },
    /**
     * Token bu kiracıya mı ait? Keycloak organization'ı alt alan adındaki kiracıyla
     * eşleşmeli. Platform personeli tüm kiracılara (destek oturumuyla) girebilir.
     */
    isSessionForTenant(): boolean {
      const session = adapter?.getSession()
      if (!session || !tenant) return false
      const organization = session.profile.organization
      if (organization === tenant.auth.organization) return true
      return tenant.kind === "tenant" && organization === PLATFORM_ORGANIZATION
    },
    /** Platform personeli bir kiracı adresindeyse destek başlığı eklenir */
    getRequestHeaders(): Record<string, string> {
      const session = adapter?.getSession()
      if (
        tenant?.kind === "tenant" &&
        session?.profile.organization === PLATFORM_ORGANIZATION
      ) {
        return { "x-support-tenant": tenant.slug }
      }
      return {}
    },
    login(options: LoginOptions): Promise<AuthFlowResult> {
      return requireAdapter().login(options)
    },
    completeLogin(url: string) {
      return requireAdapter().completeLogin(url)
    },
    refresh(): Promise<boolean> {
      return adapter ? adapter.refresh() : Promise.resolve(false)
    },
    async logout(
      options: { redirect?: boolean; broadcast?: boolean } = {}
    ): Promise<AuthFlowResult> {
      const { redirect = true, broadcast = true } = options
      if (broadcast) channel?.postMessage(LOGOUT_MESSAGE)
      return requireAdapter().logout({ redirect })
    },
    /** Başka sekmede çıkış yapıldığında çağrılır */
    onRemoteLogout(listener: Listener): () => void {
      remoteLogoutListeners.add(listener)
      return () => {
        remoteLogoutListeners.delete(listener)
      }
    },
    dispose() {
      channel?.close()
      channel = null
      remoteLogoutListeners.clear()
    },
  }
}

export type AuthController = ReturnType<typeof createAuthController>
