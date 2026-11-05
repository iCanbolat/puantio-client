import { useMatches } from "react-router"

import { can, useSession, type Permission } from "@/entities/session"
import {
  hasModule,
  useTenant,
  useTerms,
  type ModuleId,
  type Terms,
} from "@/entities/tenant"

export interface CrumbContext {
  terms: Terms
}

/** Route `handle` sözleşmesi: breadcrumb, yetki ve modül gereksinimi. */
export interface RouteHandle {
  /** Kiracı terminolojisine bağlı başlıklar için fonksiyon olabilir ("Projeler") */
  crumb?: string | ((context: CrumbContext) => string)
  /** Herhangi biri yeterli */
  permission?: Permission | readonly Permission[]
  /** Kiracının paketinde olmalı */
  module?: ModuleId
}

export interface Crumb {
  id: string
  label: string
  pathname: string
}

function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === "object" && value !== null
}

export function useBreadcrumbs(): Crumb[] {
  const matches = useMatches()
  const terms = useTerms()
  return matches.flatMap((match) => {
    if (!isRouteHandle(match.handle) || !match.handle.crumb) return []
    const { crumb } = match.handle
    const label = typeof crumb === "function" ? crumb({ terms }) : crumb
    return [{ id: match.id, label, pathname: match.pathname }]
  })
}

export type RouteAccess =
  { kind: "ok" } | { kind: "forbidden" } | { kind: "module"; module: ModuleId }

/**
 * Eşleşen tüm route'ların modül ve yetki gereksinimini denetler. Yetkisiz kullanıcı URL ile
 * gelse de sayfa render edilmez (403 sayfası). Asıl kontrol backend'dedir.
 */
export function useRouteAccess(): RouteAccess {
  const matches = useMatches()
  const tenant = useTenant()
  const me = useSession()
  for (const match of matches) {
    if (!isRouteHandle(match.handle)) continue
    const { module, permission } = match.handle
    if (module && !hasModule(tenant, module)) return { kind: "module", module }
    if (permission && !can(me, permission)) return { kind: "forbidden" }
  }
  return { kind: "ok" }
}
