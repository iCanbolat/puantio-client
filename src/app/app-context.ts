import { createBrowserRouter } from "react-router"
import { toast } from "sonner"

import {
  createAuthController,
  createOidcAuthAdapter,
  type AuthAdapterFactory,
  type AuthController,
} from "@/features/auth"
import { resolveTenantSlug } from "@/entities/tenant"
import { configureHttp } from "@/shared/api/http"
import { createQueryClient } from "@/shared/api/query-client"
import { createRealtimeClient, resolveRealtimeUrl } from "@/shared/api/realtime"
import { env } from "@/shared/config/env"
import { paths } from "@/shared/config/paths"

import { createRoutes } from "./router/routes"

type AppRouter = ReturnType<typeof createBrowserRouter>

/**
 * HTTP istemcisini kimlik denetleyicisine bağlar: token ekleme, 401'de tek seferlik sessiz
 * yenileme, yenileme başarısızsa giriş sayfasına dönüş adresiyle yönlendirme.
 */
export function connectHttpToAuth(options: {
  auth: AuthController
  getRouter: () => AppRouter | null
}): void {
  const { auth, getRouter } = options
  configureHttp({
    getAccessToken: () => auth.getAccessToken(),
    refreshAccessToken: () => auth.refresh(),
    getHeaders: () => auth.getRequestHeaders(),
    onUnauthorized: () => {
      const router = getRouter()
      if (!router || !auth.getSession()) return
      const { pathname, search } = router.state.location
      if (pathname.startsWith(paths.login())) return
      // Kullanıcı verisini giriş sayfası temizler (panel ekrandan kalktıktan sonra)
      void auth.logout({ redirect: false, broadcast: false })
      void router.navigate(
        paths.login({
          returnTo: `${pathname}${search}`,
          reason: "oturum-suresi",
        }),
        { replace: true }
      )
    },
  })
}

export interface AppContextOptions {
  /** Mock modunda dev panelinden seçilen kiracı; aksi halde adresten çözülür */
  tenantSlug?: string
  /** Mock modunda yönlendirmesiz adaptör; aksi halde Keycloak (OIDC) */
  authFactory?: AuthAdapterFactory
}

/** Uygulama bağımlılıklarını bir kez oluşturur (QueryClient, realtime, kimlik, router). */
export function createAppContext(options: AppContextOptions = {}) {
  const tenantSlug =
    options.tenantSlug ??
    resolveTenantSlug({
      hostname: window.location.hostname,
      baseDomain: env.VITE_TENANT_BASE_DOMAIN,
      fallback: env.VITE_DEFAULT_TENANT,
    })
  const queryClient = createQueryClient({
    error: (message) => toast.error(message),
    success: (message) => toast.success(message),
  })
  const realtimeClient = createRealtimeClient({
    url: resolveRealtimeUrl(
      env.VITE_API_BASE_URL,
      env.VITE_REALTIME_URL || undefined
    ),
  })
  const auth = createAuthController(
    options.authFactory ?? ((tenant) => createOidcAuthAdapter(tenant))
  )
  let router: AppRouter | null = null
  connectHttpToAuth({ auth, getRouter: () => router })
  router = createBrowserRouter(
    createRoutes({
      queryClient,
      auth,
      tenantSlug,
      showDevTools: env.VITE_API_MOCKING,
    })
  )
  return { queryClient, realtimeClient, router, auth, tenantSlug }
}

export type AppContext = ReturnType<typeof createAppContext>
