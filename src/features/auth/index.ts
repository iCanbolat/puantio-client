import type { RouteObject } from "react-router"

import {
  createLoginCallbackLoader,
  type AuthRouteContext,
} from "./routes/session-guard"

export {
  PLATFORM_ORGANIZATION,
  type AuthAdapter,
  type AuthAdapterFactory,
  type AuthFlowResult,
  type AuthSession,
  type AuthSessionProfile,
  type LoginOptions,
} from "./model/auth-adapter"
export {
  createAuthController,
  type AuthController,
} from "./lib/auth-controller"
export {
  createOidcAuthAdapter,
  readOrganization,
  toAuthSession,
} from "./lib/oidc-auth-adapter"
export { discoverProvider, emailDomain } from "./lib/provider-discovery"
export { safeReturnTo } from "./lib/return-to"
export { useSignOut } from "./lib/use-sign-out"
export { useAuth } from "./components/auth-context"
export { AuthProvider } from "./components/auth-provider"
export { IdleSessionGuard } from "./components/idle-session-guard"
export { SessionEffects } from "./components/session-effects"
export { SupportBanner } from "./components/support-banner"
export { UserMenu } from "./components/user-menu"
export {
  createBootstrapMiddleware,
  createLoginCallbackLoader,
  createSessionGuard,
  readTenant,
  type AuthRouteContext,
} from "./routes/session-guard"

/** Oturumsuz kimlik sayfaları (giriş, dönüş, yetkisiz hesap). Sayfalar ayrı chunk. */
export function authPageRoutes(context: AuthRouteContext): {
  login: Pick<RouteObject, "lazy">
  callback: Pick<RouteObject, "lazy" | "loader">
  accountPending: Pick<RouteObject, "lazy">
} {
  return {
    login: {
      lazy: async () => ({
        Component: (await import("./routes/login-page")).LoginPage,
      }),
    },
    callback: {
      loader: createLoginCallbackLoader(context),
      lazy: async () => ({
        ErrorBoundary: (await import("./routes/login-callback-error"))
          .LoginCallbackError,
      }),
    },
    accountPending: {
      lazy: async () => ({
        Component: (await import("./routes/account-pending-page"))
          .AccountPendingPage,
      }),
    },
  }
}
