import type { AuthProvider } from "@/entities/tenant"
import { toLowerTr } from "@/shared/lib/format"

export function emailDomain(email: string): string | null {
  const at = email.trim().lastIndexOf("@")
  if (at < 1) return null
  const domain = toLowerTr(email.trim().slice(at + 1))
  return domain.includes(".") ? domain : null
}

/**
 * E-posta alan adıyla sağlayıcı keşfi: `ali@firma.com` → firmanın kurumsal girişi
 * (Entra/Google federasyonu). Eşleşme yoksa yerel hesap (şifre) sağlayıcısı.
 */
export function discoverProvider(
  providers: readonly AuthProvider[],
  email: string
): AuthProvider | null {
  const domain = emailDomain(email)
  if (domain) {
    const match = providers.find((provider) =>
      provider.domains.some((item) => toLowerTr(item) === domain)
    )
    if (match) return match
  }
  return providers.find((provider) => provider.kind === "password") ?? null
}

export const PROVIDER_BUTTON_LABELS: Record<AuthProvider["kind"], string> = {
  microsoft: "Microsoft ile giriş yap",
  google: "Google ile giriş yap",
  oidc: "Kurumsal hesapla giriş yap",
  saml: "Kurumsal hesapla giriş yap",
  password: "E-posta ile giriş yap",
}
