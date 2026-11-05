import { ChevronRightIcon, SirenIcon } from "lucide-react"

import { StatusBadge } from "@/shared/components/status-badge"
import { formatTime } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"

import { ATTENDANCE_STATUS_LABELS, type LiveShift } from "../model/attendance"
import { ATTENDANCE_STATUS_TONES } from "./attendance-format"
import { AnomalyBadges } from "./attendance-ui"

export function LiveShiftCard({
  shift,
  onOpen,
}: {
  shift: LiveShift
  onOpen: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${shift.personnelName}, ${shift.locationName}, ${formatTime(shift.startsAt)}: ${ATTENDANCE_STATUS_LABELS[shift.status]}`}
        className={cn(
          "flex w-full flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          shift.status === "no_show" && "border-l-4 border-destructive"
        )}
      >
        <span className="flex items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{shift.personnelName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {shift.locationName}
              {shift.orgUnitName ? ` · ${shift.orgUnitName}` : ""}
            </span>
          </span>
          <StatusBadge
            tone={ATTENDANCE_STATUS_TONES[shift.status]}
            pulse={shift.status === "no_show"}
          >
            {ATTENDANCE_STATUS_LABELS[shift.status]}
          </StatusBadge>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span className="font-mono font-semibold text-foreground">
            {shift.code}
          </span>
          <span>
            {formatTime(shift.startsAt)}–{formatTime(shift.endsAt)}
          </span>
          {shift.checkIn ? (
            <span>Giriş {formatTime(shift.checkIn.deviceTime)}</span>
          ) : null}
          {shift.lateMinutes > 0 && shift.status !== "checked_out" ? (
            <span className="text-amber-700 dark:text-amber-400">
              {shift.lateMinutes} dk geç
            </span>
          ) : null}
          {shift.checkOut ? (
            <span>Çıkış {formatTime(shift.checkOut.deviceTime)}</span>
          ) : null}
          {shift.isBackup ? (
            <span className="text-primary">Yedek görev</span>
          ) : null}
          {shift.alarmId && shift.status === "no_show" ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <SirenIcon className="size-3" aria-hidden />
              Alarm
            </span>
          ) : null}
          <ChevronRightIcon className="ml-auto size-4" aria-hidden />
        </span>
        <AnomalyBadges anomalies={shift.anomalies} />
      </button>
    </li>
  )
}
