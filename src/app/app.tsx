import type { ReactNode } from "react"
import { RouterProvider } from "react-router/dom"

import { env } from "@/shared/config/env"

import type { AppContext } from "./app-context"
import { AppProviders } from "./providers/app-providers"

/**
 * Bağlam (QueryClient, kimlik, router) React dışında bir kez oluşturulur: StrictMode'da
 * `useState` başlatıcısı iki kez çalışır ve global HTTP yapılandırması kullanılmayan
 * kimlik denetleyicisine bağlanabilirdi.
 */
export function App({
  context,
  devtools,
}: {
  context: AppContext
  devtools?: ReactNode
}) {
  return (
    <AppProviders
      queryClient={context.queryClient}
      realtimeClient={context.realtimeClient}
      auth={context.auth}
      tenantSlug={context.tenantSlug}
      showQueryDevtools={env.VITE_APP_ENV === "development"}
    >
      <RouterProvider router={context.router} />
      {devtools}
    </AppProviders>
  )
}
