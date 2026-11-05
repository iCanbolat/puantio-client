/**
 * Uygulama dışına (başka kiracı alt alan adı, Keycloak) tam sayfa geçiş. Testlerde
 * `vi.spyOn(externalNavigation, "assign")` ile yakalanır (jsdom gezinmeyi desteklemez).
 */
export const externalNavigation = {
  assign(url: string): void {
    window.location.assign(url)
  },
}
