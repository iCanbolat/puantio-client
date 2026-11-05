import { Outlet } from "react-router"

import { brand } from "@/shared/config/brand"
import { ThemeToggle } from "@/shared/components/theme-toggle"

/** Oturumsuz kimlik sayfaları (giriş, dönüş, yetkisiz hesap) için ortalanmış kabuk. */
export function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex h-14 items-center justify-end px-4">
        <ThemeToggle />
      </header>
      <main
        id="main"
        className="flex flex-1 items-start justify-center p-4 pt-8 sm:items-center sm:pt-4"
      >
        <Outlet />
      </main>
      <footer className="p-4 text-center text-xs text-muted-foreground">
        {brand.productName} · {brand.description}
      </footer>
    </div>
  )
}
