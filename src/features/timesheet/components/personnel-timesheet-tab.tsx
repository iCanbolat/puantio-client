import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"

import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { cn } from "@/shared/lib/utils"
import { buttonVariants } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"

import { timesheetQueries } from "../api/timesheet-api"
import { CELL_CODE_LABELS, cellTone } from "../model/cell-code"
import { PERIOD_STATUS_LABELS } from "../model/timesheet"
import { PERIOD_STATUS_TONES, monthLabel } from "./period-format"

/** Personel kartı "Puantaj" sekmesi: tüzel kişiliğin son dönemindeki satırı */
export function PersonnelTimesheetTab({
  legalEntityId,
  employeeNumber,
}: {
  legalEntityId: string
  employeeNumber: string
}) {
  const periods = useQuery(timesheetQueries.periods(legalEntityId))
  const period = periods.data?.items[0]
  const grid = useQuery({
    ...timesheetQueries.grid(period?.id ?? "", {
      q: employeeNumber,
      orgUnitId: undefined,
      locationId: undefined,
    }),
    enabled: Boolean(period),
  })
  if (periods.isError)
    return (
      <ErrorState
        error={periods.error}
        onRetry={() => void periods.refetch()}
      />
    )
  if (!period)
    return periods.isPending ? (
      <Skeleton className="h-24 w-full" />
    ) : (
      <EmptyState title="Puantaj dönemi yok" />
    )
  const row = grid.data?.rows.find(
    (item) => item.employeeNumber === employeeNumber
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium capitalize">
          {monthLabel(period.month)}
        </span>
        <StatusBadge tone={PERIOD_STATUS_TONES[period.status]}>
          {PERIOD_STATUS_LABELS[period.status]}
        </StatusBadge>
        <Link
          to={paths.timesheet.period(period.id)}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "ml-auto"
          )}
        >
          Dönemi aç
        </Link>
      </div>
      {grid.isError ? (
        <ErrorState error={grid.error} onRetry={() => void grid.refetch()} />
      ) : !grid.data ? (
        <Skeleton className="h-16 w-full" />
      ) : !row ? (
        <EmptyState title="Bu dönemde puantaj satırı yok" />
      ) : (
        <>
          <ol
            className="grid grid-cols-7 gap-1 sm:grid-cols-[repeat(16,minmax(0,1fr))]"
            aria-label="Günlük puantaj kodları"
          >
            {row.cells.map((cell) => (
              <li
                key={cell.date}
                title={`${cell.date}: ${cell.code ? CELL_CODE_LABELS[cell.code] : "belirlenmedi"}`}
                className={cn(
                  "flex flex-col items-center rounded border py-1 text-[11px]",
                  cellTone(cell.code) === "absent" &&
                    "bg-destructive/10 text-destructive",
                  cellTone(cell.code) === "leave" && "bg-sky-500/10",
                  cellTone(cell.code) === "missing" && "bg-amber-500/20"
                )}
              >
                <span className="text-muted-foreground tabular-nums">
                  {Number(cell.date.slice(8))}
                </span>
                <span className="font-mono font-semibold">
                  {cell.code ?? "·"}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            Çalışılan {row.summary.workedDays.toLocaleString("tr-TR")} gün ·
            fazla mesai {row.summary.overtimeHours.toLocaleString("tr-TR")} saat
            · devamsız {row.summary.absenceDays} gün · izin{" "}
            {row.summary.leaveDays} gün
          </p>
        </>
      )}
    </div>
  )
}
