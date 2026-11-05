import { useQuery } from "@tanstack/react-query"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { LEAVE_TYPE_LABELS, leaveQueries, type Leave } from "@/entities/leave"
import { ErrorState } from "@/shared/components/error-state"
import { toIsoDate } from "@/shared/lib/date"
import { serverNow } from "@/shared/lib/server-time"
import { cn } from "@/shared/lib/utils"
import {
  addMonths,
  eachIsoDate,
  isoWeekday,
  monthRange,
} from "@/shared/lib/work-time"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]

const monthTitle = (month: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`))

/** Aylık izin takvimi: her gün o gün izinli/raporlu personel */
export function LeaveCalendar({
  month,
  orgUnitId,
  onMonthChange,
}: {
  month: string | undefined
  orgUnitId: string | undefined
  onMonthChange: (month: string) => void
}) {
  const current = month ?? toIsoDate(serverNow()).slice(0, 7)
  const query = useQuery(
    leaveQueries.list({
      page: 1,
      pageSize: 100,
      month: current,
      orgUnitId,
      sort: undefined,
      order: undefined,
      q: undefined,
      status: undefined,
      type: undefined,
      personnelId: undefined,
    })
  )
  const range = monthRange(current)
  const days = eachIsoDate(range.from, range.to)
  const leading = isoWeekday(range.from) - 1
  const active = (query.data?.items ?? []).filter(
    (leave) => leave.status === "approved" || leave.status === "pending"
  )
  const onDay = (date: string): Leave[] =>
    active.filter((leave) => leave.startDate <= date && leave.endDate >= date)

  return (
    <section aria-label="İzin takvimi" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Önceki ay"
          onClick={() => {
            onMonthChange(addMonths(current, -1))
          }}
        >
          <ChevronLeftIcon />
        </Button>
        <h2 className="min-w-40 text-center font-heading font-semibold capitalize">
          {monthTitle(current)}
        </h2>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Sonraki ay"
          onClick={() => {
            onMonthChange(addMonths(current, 1))
          }}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div
          className="grid grid-cols-7 gap-1 text-xs"
          role="grid"
          aria-label={`${monthTitle(current)} izinleri`}
        >
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              role="columnheader"
              className="px-1 py-1 font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
          {Array.from({ length: leading }, (_, index) => (
            <div key={`pad-${index}`} aria-hidden />
          ))}
          {days.map((date) => {
            const leaves = onDay(date)
            return (
              <div
                key={date}
                role="gridcell"
                aria-label={`${date.slice(8)}: ${leaves.length} kişi izinli`}
                className={cn(
                  "flex min-h-20 flex-col gap-0.5 rounded-md border bg-background p-1",
                  isoWeekday(date) === 7 && "bg-muted/50"
                )}
              >
                <span className="font-medium tabular-nums">
                  {Number(date.slice(8))}
                </span>
                {leaves.slice(0, 3).map((leave) => (
                  <span
                    key={leave.id}
                    title={`${leave.personnelName} · ${LEAVE_TYPE_LABELS[leave.type]}`}
                    className={cn(
                      "truncate rounded px-1",
                      leave.status === "pending"
                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                        : leave.type === "sick_report"
                          ? "bg-rose-500/15 text-rose-800 dark:text-rose-300"
                          : "bg-sky-500/15 text-sky-800 dark:text-sky-300"
                    )}
                  >
                    {leave.personnelName}
                  </span>
                ))}
                {leaves.length > 3 ? (
                  <span className="text-muted-foreground">
                    +{leaves.length - 3} kişi
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
