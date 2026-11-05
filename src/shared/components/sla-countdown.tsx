import { TimerIcon } from "lucide-react"

import { useNow } from "@/shared/hooks/use-now"
import { toDate, type DateInput } from "@/shared/lib/date"
import { formatCountdown } from "@/shared/lib/format"
import { getSlaState, type SlaState } from "@/shared/lib/sla"
import { cn } from "@/shared/lib/utils"

const stateClasses: Record<SlaState, string> = {
  ok: "bg-muted text-foreground",
  warning: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  breached: "bg-destructive/15 text-destructive",
}

/**
 * SLA geri sayımı (ör. gelmeyen personel alarmında 15 dk). Sunucu saatine göre çalışır.
 * Süre dolduğunda negatif süreyi "Aşıldı" etiketiyle gösterir.
 */
export function SlaCountdown({
  dueAt,
  warnBelowMs = 5 * 60_000,
  className,
}: {
  dueAt: DateInput
  warnBelowMs?: number
  className?: string
}) {
  const now = useNow(1000)
  const remainingMs = toDate(dueAt).getTime() - now.getTime()
  const state = getSlaState(remainingMs, warnBelowMs)
  const label =
    state === "breached"
      ? `SLA ${formatCountdown(Math.abs(remainingMs))} aşıldı`
      : `SLA için kalan süre ${formatCountdown(remainingMs)}`

  return (
    <span
      role="timer"
      aria-label={label}
      data-state={state}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-mono text-xs font-semibold tabular-nums",
        stateClasses[state],
        className
      )}
    >
      <TimerIcon className="size-3.5" aria-hidden />
      {state === "breached"
        ? `Aşıldı ${formatCountdown(remainingMs)}`
        : formatCountdown(remainingMs)}
    </span>
  )
}
