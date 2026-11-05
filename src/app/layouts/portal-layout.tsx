import { Building2Icon } from "lucide-react"
import { Outlet } from "react-router"

import { ThemeToggle } from "@/shared/components/theme-toggle"
import { brand } from "@/shared/config/brand"

/** Müşteri portalı kabuğu (Faz 4'te doldurulacak). Firma iç menüsünü göstermez. Faz 1'de kiracı markası eklenir. */
export function PortalLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="flex h-14 items-center gap-3 border-b bg-background px-4 md:px-6">
        <Building2Icon className="size-5 text-primary" aria-hidden />
        <span className="font-heading font-semibold">
          {brand.productName} Müşteri Portalı
        </span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6"
      >
        <Outlet />
      </main>
    </div>
  )
}
