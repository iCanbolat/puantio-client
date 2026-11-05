import type { QueryClient } from "@tanstack/react-query"
import { render, type RenderResult } from "@testing-library/react"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import type { ReactElement } from "react"
import { createMemoryRouter, type RouteObject } from "react-router"
import { RouterProvider } from "react-router/dom"
import { toast } from "sonner"
import { vi } from "vitest"

import { connectHttpToAuth } from "@/app/app-context"
import { AppProviders } from "@/app/providers/app-providers"
import { createRoutes } from "@/app/router/routes"
import { createAuthController, type AuthController } from "@/features/auth"
import { identityFor } from "@/mocks/auth/identities"
import {
  createMockAuthAdapter,
  type MockAuthAdapter,
} from "@/mocks/auth/mock-auth-adapter"
import { mintMockToken } from "@/mocks/auth/token"
import { configureHttp } from "@/shared/api/http"
import { createQueryClient } from "@/shared/api/query-client"
import { createRealtimeClient, resolveRealtimeUrl } from "@/shared/api/realtime"
import { storageKey } from "@/shared/config/brand"
import { env } from "@/shared/config/env"

export const DEFAULT_TEST_TENANT = "temizlik-orta"

/** Testlerde yeniden deneme kapalı; önbellek kalıcı (gc testleri etkilemesin). */
export function createTestQueryClient(): QueryClient {
  const queryClient = createQueryClient({
    error: (message) => toast.error(message),
    success: (message) => toast.success(message),
  })
  queryClient.setDefaultOptions({
    queries: {
      ...queryClient.getDefaultOptions().queries,
      retry: false,
      gcTime: Infinity,
    },
    mutations: { retry: false },
  })
  return queryClient
}

export interface RenderAppOptions {
  route?: string
  showDevTools?: boolean
  queryClient?: QueryClient
  /** Sahte zamanlayıcı kullanan testlerde user-event'in zamanı ilerletmesi için */
  fakeTimers?: boolean
  /** Mock kiracı (varsayılan: temizlik-orta) */
  tenant?: string
  /**
   * Oturum açmış kullanıcı anahtarı: "admin", "bolge", "supervizor", "ik", "destek",
   * "kayitsiz" veya kullanıcı kimliği. `null`: oturum yok.
   */
  user?: string | null
  /** Giriş butonuna basıldığında açılacak kullanıcı (varsayılan: `user` veya admin) */
  loginAs?: string
}

export interface RenderAppResult extends RenderResult {
  user: UserEvent
  router: ReturnType<typeof createMemoryRouter>
  queryClient: QueryClient
  auth: AuthController
  /** Kiracı yüklendikten sonra oluşturulan mock kimlik adaptörü */
  getAuthAdapter: () => MockAuthAdapter
}

function createUser(fakeTimers: boolean): UserEvent {
  return userEvent.setup(
    fakeTimers ? { advanceTimers: vi.advanceTimersByTime.bind(vi) } : {}
  )
}

function createTestAuth(options: RenderAppOptions) {
  let adapter: MockAuthAdapter | null = null
  const userKey = options.user === undefined ? "admin" : options.user
  // Önceki render'ın oturumu (sessionStorage) yeni kullanıcı seçimini ezmesin
  sessionStorage.removeItem(
    storageKey("mock-auth", options.tenant ?? DEFAULT_TEST_TENANT)
  )
  const auth = createAuthController((tenant) => {
    adapter = createMockAuthAdapter(tenant, {
      initialIdentity: userKey ? identityFor(tenant.slug, userKey) : null,
      resolveIdentity: () =>
        identityFor(tenant.slug, options.loginAs ?? userKey ?? "admin"),
    })
    return adapter
  })
  return {
    auth,
    getAuthAdapter: () => {
      if (!adapter) throw new Error("Kimlik adaptörü henüz oluşturulmadı")
      return adapter
    },
  }
}

function renderInProviders(
  routes: RouteObject[],
  options: RenderAppOptions & {
    auth: AuthController
    getAuthAdapter: () => MockAuthAdapter
    queryClient: QueryClient
  }
): RenderAppResult {
  const realtimeClient = createRealtimeClient({
    url: resolveRealtimeUrl(env.VITE_API_BASE_URL),
    logger: { warn: () => undefined },
  })
  const router = createMemoryRouter(routes, {
    initialEntries: [options.route ?? "/"],
  })
  const user = createUser(options.fakeTimers ?? false)
  const result = render(
    <AppProviders
      queryClient={options.queryClient}
      realtimeClient={realtimeClient}
      auth={options.auth}
      tenantSlug={options.tenant ?? DEFAULT_TEST_TENANT}
    >
      <RouterProvider router={router} />
    </AppProviders>
  )
  return {
    ...result,
    user,
    router,
    queryClient: options.queryClient,
    auth: options.auth,
    getAuthAdapter: options.getAuthAdapter,
  }
}

/**
 * Uygulamanın gerçek route ağacını (kiracı kökü, oturum koruması, layout, hata sınırları,
 * lazy route'lar) mock kiracı ve kullanıcıyla render eder.
 */
export function renderApp(options: RenderAppOptions = {}): RenderAppResult {
  const queryClient = options.queryClient ?? createTestQueryClient()
  const tenantSlug = options.tenant ?? DEFAULT_TEST_TENANT
  const { auth, getAuthAdapter } = createTestAuth(options)
  let router: ReturnType<typeof createMemoryRouter> | null = null
  connectHttpToAuth({ auth, getRouter: () => router })
  const result = renderInProviders(
    createRoutes({
      queryClient,
      auth,
      tenantSlug,
      showDevTools: options.showDevTools ?? true,
    }),
    { ...options, queryClient, auth, getAuthAdapter }
  )
  router = result.router
  return result
}

/**
 * Tek bir bileşeni tüm provider'lar ve bir router içinde render eder. İstekler seçilen
 * kullanıcının mock token'ıyla gider (kimlik akışı çalıştırılmaz).
 */
export function renderWithProviders(
  ui: ReactElement,
  options: Omit<RenderAppOptions, "showDevTools"> = {}
): RenderAppResult {
  const queryClient = options.queryClient ?? createTestQueryClient()
  const tenantSlug = options.tenant ?? DEFAULT_TEST_TENANT
  const { auth, getAuthAdapter } = createTestAuth(options)
  const userKey = options.user === undefined ? "admin" : options.user
  const identity = userKey ? identityFor(tenantSlug, userKey) : null
  const token = identity
    ? mintMockToken({
        organization: identity.organization,
        userId: identity.userId,
        expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60_000,
      })
    : null
  configureHttp({ getAccessToken: () => token })
  return renderInProviders([{ path: "*", element: ui }], {
    ...options,
    queryClient,
    auth,
    getAuthAdapter,
  })
}
