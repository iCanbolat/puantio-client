import { Suspense } from "react"
import { Outlet } from "react-router"

import { PageSkeleton } from "@/shared/components/page-skeleton"

import { useRouteAccess } from "../router/route-handle"
import { ForbiddenPage } from "../routes/status-pages"

/** Menüsüz baskı kabuğu (A4 etiket baskısı). Ekranda araç çubuğu, baskıda yalnızca içerik. */
export function PrintLayout() {
  const access = useRouteAccess()
  return (
    <main id="main" className="min-h-svh bg-muted/40 print:bg-white">
      <Suspense fallback={<PageSkeleton />}>
        {access.kind === "ok" ? <Outlet /> : <ForbiddenPage />}
      </Suspense>
    </main>
  )
}
