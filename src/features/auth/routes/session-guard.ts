import type { QueryClient } from "@tanstack/react-query"
import {
  redirect,
  type LoaderFunctionArgs,
  type MiddlewareFunction,
} from "react-router"

import { SESSION_ERROR_CODES, sessionQueries } from "@/entities/session"
import { tenantQueries, type TenantConfig } from "@/entities/tenant"
import { ApiError } from "@/shared/api/errors"
import { paths } from "@/shared/config/paths"

import type { AuthController } from "../lib/auth-controller"

export interface AuthRouteContext {
  auth: AuthController
  queryClient: QueryClient
  tenantSlug: string
}

export function readTenant(context: AuthRouteContext): TenantConfig {
  const tenant = context.queryClient.getQueryData(
    tenantQueries.config(context.tenantSlug).queryKey
  )
  if (!tenant) throw new Error("Kiracı yapılandırması yüklenmedi")
  return tenant
}

/**
 * Uygulama açılışı (kök middleware): kiracı yapılandırmasını yükler ve kimlik adaptörünü
 * başlatır. Middleware'ler loader'lardan önce ve kökten yaprağa sırayla çalışır; böylece
 * sayfa loader'larının istekleri token ile gider.
 */
export function createBootstrapMiddleware(
  context: AuthRouteContext,
  onTenantLoaded?: (tenant: TenantConfig) => void
): MiddlewareFunction {
  return async () => {
    const tenant = await context.queryClient.query(
      tenantQueries.config(context.tenantSlug)
    )
    onTenantLoaded?.(tenant)
    await context.auth.initialize(tenant)
  }
}

/**
 * Oturum koruması (panel, baskı ve platform kökleri): oturum yoksa giriş sayfasına dönüş
 * adresiyle yönlendirir, token başka kiracıya aitse reddeder, `/me` ile kullanıcıyı yükler.
 */
export function createSessionGuard(
  context: AuthRouteContext,
  area: "tenant" | "platform"
): MiddlewareFunction {
  return async ({ request }) => {
    const url = new URL(request.url)
    const returnTo = `${url.pathname}${url.search}`
    const tenant = readTenant(context)

    if (area === "tenant" && tenant.kind === "platform")
      throw redirect(paths.platform.home())
    if (area === "platform" && tenant.kind !== "platform")
      throw redirect(paths.home())

    if (!context.auth.getSession()) {
      throw redirect(paths.login({ returnTo }))
    }
    if (!context.auth.isSessionForTenant()) {
      await context.auth.logout({ redirect: false, broadcast: false })
      context.queryClient.clear()
      throw redirect(paths.login({ reason: "kiraci-uyusmazligi" }))
    }

    try {
      await context.queryClient.query(sessionQueries.me())
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          throw redirect(paths.login({ returnTo, reason: "oturum-suresi" }))
        }
        if (error.code === SESSION_ERROR_CODES.supportRequired) {
          throw redirect(paths.accountPending("destek"))
        }
        if (
          error.code === SESSION_ERROR_CODES.notProvisioned ||
          error.code === SESSION_ERROR_CODES.disabled
        ) {
          throw redirect(paths.accountPending())
        }
      }
      throw error
    }
  }
}

/** Redirect dönüşü: kodu token'a çevirir, dönüş adresine yönlendirir. */
export function createLoginCallbackLoader(context: AuthRouteContext) {
  return async ({ request }: LoaderFunctionArgs) => {
    const { returnTo } = await context.auth.completeLogin(request.url)
    return redirect(returnTo)
  }
}
