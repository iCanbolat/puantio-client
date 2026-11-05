import { BuildingIcon } from "lucide-react"
import { useRouteError } from "react-router"

import { ApiError } from "@/shared/api/errors"
import { brand } from "@/shared/config/brand"
import { EmptyState } from "@/shared/components/empty-state"

import { RouteError } from "./route-error"

/**
 * Kök hata sınırı: kiracı yapılandırması alınamazsa uygulama açılmaz. Adres bir firmaya
 * ait değilse anlaşılır mesaj; kontrat hatası ve diğerleri genel hata ekranına düşer.
 */
export function RootError() {
  const error = useRouteError()
  if (error instanceof ApiError && error.status === 404) {
    return (
      <main
        id="main"
        className="flex min-h-svh items-center justify-center p-6"
      >
        <EmptyState
          icon={BuildingIcon}
          title="Firma bulunamadı"
          description={`Bu adreste kayıtlı bir ${brand.productName} firması yok. Adresi kontrol edin veya firmanızdan doğru bağlantıyı isteyin.`}
        />
      </main>
    )
  }
  return (
    <main id="main" className="flex min-h-svh flex-col">
      <RouteError />
    </main>
  )
}
