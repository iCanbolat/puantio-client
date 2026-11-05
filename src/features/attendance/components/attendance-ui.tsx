import {
  CloudOffIcon,
  CopyIcon,
  MapPinOffIcon,
  TimerOffIcon,
  WatchIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/shared/lib/utils"

import {
  ANOMALY_LABELS,
  type Anomaly,
  type AnomalyCode,
} from "../model/attendance"

const ANOMALY_ICONS: Record<AnomalyCode, LucideIcon> = {
  outside_geofence: MapPinOffIcon,
  missing_checkout: TimerOffIcon,
  duplicate_checkin: CopyIcon,
  clock_skew: WatchIcon,
  late_sync: CloudOffIcon,
}

export function AnomalyBadges({
  anomalies,
  className,
}: {
  anomalies: readonly Anomaly[]
  className?: string
}) {
  if (anomalies.length === 0) return null
  return (
    <ul
      className={cn("flex flex-wrap gap-1", className)}
      aria-label="Anomaliler"
    >
      {anomalies.map((anomaly) => {
        const Icon = ANOMALY_ICONS[anomaly.code]
        return (
          <li
            key={anomaly.code}
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-300"
          >
            <Icon className="size-3" aria-hidden />
            {ANOMALY_LABELS[anomaly.code]}
            {anomaly.detail ? (
              <span className="font-normal opacity-80">· {anomaly.detail}</span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
