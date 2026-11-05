import {
  BellIcon,
  BellOffIcon,
  RadioIcon,
  Volume2Icon,
  VolumeXIcon,
  WifiOffIcon,
} from "lucide-react"
import { useState } from "react"

import { useRealtimeStatus } from "@/shared/api/realtime-hooks"
import { StatusBadge } from "@/shared/components/status-badge"
import { useUiStore } from "@/shared/stores/ui-store"
import { Button } from "@/shared/ui/button"

import { notificationsSupported } from "./alarm-signals"

/** Canlı bağlantı durumu, bildirim izni ve ses tercihi */
export function LiveControls() {
  const status = useRealtimeStatus()
  const soundEnabled = useUiStore((state) => state.alarmSoundEnabled)
  const setSoundEnabled = useUiStore((state) => state.setAlarmSoundEnabled)
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => (notificationsSupported() ? Notification.permission : "unsupported"))
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "open" ? (
        <StatusBadge tone="success" pulse>
          <RadioIcon className="size-3" aria-hidden />
          Canlı
        </StatusBadge>
      ) : (
        <StatusBadge tone="warning">
          <WifiOffIcon className="size-3" aria-hidden />
          Canlı bağlantı yok · 15 sn'de bir yenileniyor
        </StatusBadge>
      )}
      <Button
        variant="outline"
        size="sm"
        aria-pressed={soundEnabled}
        onClick={() => {
          setSoundEnabled(!soundEnabled)
        }}
      >
        {soundEnabled ? (
          <Volume2Icon data-icon="inline-start" />
        ) : (
          <VolumeXIcon data-icon="inline-start" />
        )}
        {soundEnabled ? "Ses açık" : "Ses kapalı"}
      </Button>
      {permission === "default" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void Notification.requestPermission().then(setPermission)
          }}
        >
          <BellIcon data-icon="inline-start" />
          Bildirimlere izin ver
        </Button>
      ) : permission === "denied" ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <BellOffIcon className="size-3.5" aria-hidden />
          Bildirimler engelli
        </span>
      ) : null}
    </div>
  )
}
