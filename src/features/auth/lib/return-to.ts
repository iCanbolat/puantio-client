import { paths, routePatterns } from "@/shared/config/paths"

/**
 * Giriş sonrası dönüş adresi yalnızca uygulama içi bir yol olabilir (açık yönlendirme
 * açığı olmasın). Giriş sayfalarının kendisine dönülmez.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return paths.home()
  if (
    value.startsWith(routePatterns.login) ||
    value.startsWith(routePatterns.accountPending)
  )
    return paths.home()
  return value
}
