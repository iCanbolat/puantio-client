import { Building2Icon, QrCodeIcon } from "lucide-react"
import { useParams } from "react-router"

import { EmptyState } from "@/shared/components/empty-state"

export function PortalHomePlaceholder() {
  return (
    <EmptyState
      icon={Building2Icon}
      title="Müşteri portalı"
      description="SLA, denetim ve kadro raporları Faz 4'te bu alanda yer alacak."
    />
  )
}

export function PublicFeedbackPlaceholder() {
  const { token } = useParams()
  return (
    <EmptyState
      icon={QrCodeIcon}
      title="Temizlik bildirimi"
      description={`QR bildirim formu Faz 4'te devreye alınacak.${token ? ` (Alan kodu: ${token})` : ""}`}
    />
  )
}
