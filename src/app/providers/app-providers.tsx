import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type { ReactNode } from "react"

import { AuthProvider, type AuthController } from "@/features/auth"
import { TenantSlugProvider } from "@/entities/tenant"
import type { RealtimeClient } from "@/shared/api/realtime"
import { RealtimeProvider } from "@/shared/api/realtime-react"
import { storageKey } from "@/shared/config/brand"
import { ThemeProvider } from "@/shared/theme"
import { Toaster } from "@/shared/ui/sonner"
import { TooltipProvider } from "@/shared/ui/tooltip"

export function AppProviders({
  queryClient,
  realtimeClient,
  auth,
  tenantSlug,
  showQueryDevtools = false,
  children,
}: {
  queryClient: QueryClient
  realtimeClient: RealtimeClient
  auth: AuthController
  tenantSlug: string
  showQueryDevtools?: boolean
  children: ReactNode
}) {
  return (
    <ThemeProvider storageKey={storageKey("theme")}>
      <QueryClientProvider client={queryClient}>
        <TenantSlugProvider slug={tenantSlug}>
          <AuthProvider controller={auth}>
            <RealtimeProvider client={realtimeClient}>
              <TooltipProvider>
                {children}
                <Toaster position="top-right" closeButton />
              </TooltipProvider>
            </RealtimeProvider>
          </AuthProvider>
        </TenantSlugProvider>
        {showQueryDevtools ? (
          <ReactQueryDevtools buttonPosition="bottom-right" />
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  )
}
