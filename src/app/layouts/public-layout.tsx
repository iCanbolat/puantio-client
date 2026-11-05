import { Outlet } from "react-router"

import { brand } from "@/shared/config/brand"

/**
 * Login gerektirmeyen, mobil öncelikli sade kabuk (QR bildirim sayfası).
 * Ağır bağımlılık içermez; ayrı chunk olarak yüklenir.
 */
export function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <main
        id="main"
        className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4"
      >
        <Outlet />
      </main>
      <footer className="p-4 text-center text-xs text-muted-foreground">
        {brand.productName} altyapısıyla hizmet verilmektedir
      </footer>
    </div>
  )
}
