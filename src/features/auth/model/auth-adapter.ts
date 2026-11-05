import type { TenantConfig } from "@/entities/tenant"

/** Oturumun kimlik bilgisi (Keycloak token'ından). */
export interface AuthSessionProfile {
  subject: string
  /** Keycloak organization takma adı (kiracı). Platform personelinde "platform". */
  organization: string
  name: string | null
  email: string | null
}

export interface AuthSession {
  accessToken: string
  /** Erişim token'ının bitiş anı (epoch ms) */
  expiresAt: number
  profile: AuthSessionProfile
}

export interface LoginOptions {
  returnTo: string
  /** Keycloak `kc_idp_hint`: doğrudan federasyon sağlayıcısına yönlendirir */
  idpHint?: string | null
  /** Keycloak giriş formuna önceden yazılacak e-posta */
  loginHint?: string | null
}

/** OIDC tarayıcıyı Keycloak'a yönlendirir; mock adaptör oturumu yerinde açar. */
export type AuthFlowResult =
  { kind: "redirect" } | { kind: "completed"; returnTo: string }

/**
 * Kimlik sağlayıcı adaptörü. Gerçek ortamda Keycloak (oidc-client-ts), mock modunda
 * yönlendirmesiz `MockAuthAdapter` (bkz. `mocks/auth`). Uygulama yalnızca bu arayüzü bilir.
 */
export interface AuthAdapter {
  readonly kind: "oidc" | "mock"
  /** Depodaki oturumu yükler (sayfa yenileme) */
  init(): Promise<void>
  getSession(): AuthSession | null
  login(options: LoginOptions): Promise<AuthFlowResult>
  /** Redirect dönüşünü (`/giris/geri-donus?code=...`) işler */
  completeLogin(url: string): Promise<{ returnTo: string }>
  /** Sessiz yenileme (refresh token). Başarılıysa `true`. */
  refresh(): Promise<boolean>
  /** `redirect: true` ise Keycloak oturumu da kapatılır (end_session) */
  logout(options: { redirect: boolean }): Promise<AuthFlowResult>
}

export type AuthAdapterFactory = (tenant: TenantConfig) => AuthAdapter

/** Platform personelinin Keycloak organization'ı */
export const PLATFORM_ORGANIZATION = "platform"
