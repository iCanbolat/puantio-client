import { Suspense, useMemo } from "react"
import { Outlet } from "react-router"

import { SessionEffects, SupportBanner } from "@/features/auth"
import { useSession } from "@/entities/session"
import { useTenant, useTerms } from "@/entities/tenant"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { useUiStore } from "@/shared/stores/ui-store"
import { SidebarInset, SidebarProvider } from "@/shared/ui/sidebar"

import { useRouteAccess } from "../router/route-handle"
import { ForbiddenPage, ModuleUnavailablePage } from "../routes/status-pages"
import { AppSidebar } from "./app-sidebar"
import {
  buildNavigation,
  filterNavigation,
  type NavSection,
} from "./navigation"
import { TenantHeader } from "./tenant-header"
import { TopBar } from "./top-bar"

function AccessGuardedOutlet() {
  const access = useRouteAccess()
  if (access.kind === "forbidden") return <ForbiddenPage />
  if (access.kind === "module")
    return <ModuleUnavailablePage module={access.module} />
  return <Outlet />
}

/** Sidebar + üst bar + içerik iskeleti (panel ve platform kabukları ortak kullanır). */
export function ShellFrame({
  sections,
  homePath,
  header,
}: {
  sections: NavSection[]
  homePath?: string
  header: React.ReactNode
}) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen)
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        İçeriğe atla
      </a>
      <AppSidebar
        sections={sections}
        header={header}
        {...(homePath ? { homePath } : {})}
      />
      {/* min-w-0: geniş tablolar sayfayı değil kendi alanlarını kaydırsın */}
      <SidebarInset className="min-w-0">
        <SupportBanner />
        <TopBar />
        {/* SidebarInset zaten <main> landmark'ıdır; içerik alanı atlama bağlantısının hedefi */}
        <div
          id="main"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col gap-6 p-4 outline-none md:p-6"
        >
          <Suspense fallback={<PageSkeleton />}>
            <AccessGuardedOutlet />
          </Suspense>
        </div>
      </SidebarInset>
      <SessionEffects />
    </SidebarProvider>
  )
}

/** Kiracı firmanın iç kullanıcıları için yönetim paneli kabuğu. */
export function PanelLayout({ showDevTools }: { showDevTools: boolean }) {
  const terms = useTerms()
  const tenant = useTenant()
  const me = useSession()
  const sections = useMemo(
    () =>
      filterNavigation(buildNavigation({ showDevTools, terms }), {
        me,
        tenant,
      }),
    [showDevTools, terms, me, tenant]
  )
  return <ShellFrame sections={sections} header={<TenantHeader />} />
}
