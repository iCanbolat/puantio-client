import { useQuery } from "@tanstack/react-query"

import { shiftQueries } from "@/entities/shift"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { toIsoDate } from "@/shared/lib/date"
import { formatTime } from "@/shared/lib/format"
import { serverNow } from "@/shared/lib/server-time"
import { addDaysIso } from "@/shared/lib/work-time"
import { Skeleton } from "@/shared/ui/skeleton"

import { dayLabel } from "./day-label"

/** Personel kartı "Vardiya" sekmesi: önümüzdeki ve son 7 gün */
export function PersonnelShiftsTab({ personnelId }: { personnelId: string }) {
  const today = toIsoDate(serverNow())
  const from = addDaysIso(today, -7)
  const to = addDaysIso(today, 14)
  const query = useQuery(shiftQueries.personnel(personnelId, from, to))
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  if (query.isPending) return <Skeleton className="h-40 w-full" />
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        title="Planlanmış vardiya yok"
        description="Son 7 gün ve önümüzdeki 14 gün."
      />
    )
  }
  return (
    <ul className="divide-y rounded-lg border" aria-label="Vardiyalar">
      {query.data.items.map((shift) => (
        <li
          key={shift.id}
          className="flex flex-wrap items-center gap-3 p-3 text-sm"
        >
          <span className="w-24 font-medium tabular-nums">
            {dayLabel(shift.date)}
          </span>
          <span className="w-14 font-mono font-semibold">{shift.code}</span>
          <span className="tabular-nums">
            {formatTime(shift.startsAt)}–{formatTime(shift.endsAt)}
          </span>
          <span className="truncate text-muted-foreground">
            {shift.locationName}
          </span>
          {shift.kind === "backup" ? (
            <span className="text-xs text-primary">Yedek görev</span>
          ) : null}
          {shift.date === today ? (
            <span className="ml-auto text-xs font-medium text-primary">
              Bugün
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
