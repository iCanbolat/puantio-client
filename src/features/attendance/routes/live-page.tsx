import { useQuery } from "@tanstack/react-query"
import { SirenIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { LocationCombobox } from "@/entities/location"
import { OrgUnitSelect } from "@/entities/org-unit"
import { useTerms } from "@/entities/tenant"
import { usePollingFallback } from "@/shared/api/realtime-hooks"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateLong } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { buttonVariants } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"

import { ATTENDANCE_POLL_MS, attendanceQueries } from "../api/attendance-api"
import { LiveControls } from "../components/live-controls"
import { LiveShiftCard } from "../components/live-shift-card"
import { ShiftDetailSheet } from "../components/shift-detail-sheet"
import { useTitleCounter } from "../components/attendance-format"
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  liveBoardParamsSchema,
} from "../model/attendance"

export function LivePage() {
  const terms = useTerms()
  const [params, setParams, resetParams] = useSearchParamsState(
    liveBoardParamsSchema
  )
  const refetchInterval = usePollingFallback(ATTENDANCE_POLL_MS)
  const query = useQuery({ ...attendanceQueries.live(params), refetchInterval })
  const [openShift, setOpenShift] = useState<string | null>(null)
  const counts = query.data?.counts
  useTitleCounter(counts?.no_show ?? 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Canlı yoklama"
        description={
          query.data
            ? `${formatDateLong(query.data.date)} vardiyaları`
            : "Bugünün vardiyaları"
        }
        actions={
          <Link
            to={paths.attendance.alarms()}
            className={buttonVariants({
              variant: counts?.no_show ? "default" : "outline",
            })}
          >
            <SirenIcon data-icon="inline-start" />
            Alarm merkezi
            {counts?.no_show ? ` (${counts.no_show})` : ""}
          </Link>
        }
      />
      <LiveControls />
      <FilterBar
        search={params.q}
        onSearchChange={(q) => {
          setParams({ q }, { replace: true })
        }}
        searchPlaceholder="Personel veya lokasyon ara…"
        searchLabel="Canlı panoda ara"
        activeFilterCount={
          [params.orgUnitId, params.locationId, params.status].filter(Boolean)
            .length
        }
        onReset={resetParams}
      >
        <OrgUnitSelect
          allowAll
          value={params.orgUnitId ?? null}
          onValueChange={(orgUnitId) => {
            setParams({ orgUnitId: orgUnitId ?? undefined })
          }}
          className="h-8 w-48"
          aria-label={`${terms.orgLevels[0]?.singular ?? "Bölge"} filtresi`}
        />
        <LocationCombobox
          aria-label={`${terms.location.singular} filtresi`}
          value={params.locationId ?? null}
          onValueChange={(locationId) => {
            setParams({ locationId: locationId ?? undefined })
          }}
          className="w-56"
        />
      </FilterBar>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Durum filtresi"
      >
        {ATTENDANCE_STATUSES.map((status) => {
          const active = params.status === status
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setParams({ status: active ? undefined : status })
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
                status === "no_show" &&
                  !active &&
                  (counts?.no_show ?? 0) > 0 &&
                  "border-destructive/50 text-destructive"
              )}
            >
              {ATTENDANCE_STATUS_LABELS[status]}
              <span className="tabular-nums" data-testid={`count-${status}`}>
                {counts?.[status] ?? 0}
              </span>
            </button>
          )
        })}
      </div>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title="Bu filtrede vardiya yok"
          description="Filtreleri temizleyin veya başka bir bölge seçin."
        />
      ) : (
        <ul
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="Bugünün vardiyaları"
        >
          {query.data.items.map((shift) => (
            <LiveShiftCard
              key={shift.shiftId}
              shift={shift}
              onOpen={() => {
                setOpenShift(shift.shiftId)
              }}
            />
          ))}
        </ul>
      )}
      <ShiftDetailSheet
        shiftId={openShift}
        onClose={() => {
          setOpenShift(null)
        }}
      />
    </div>
  )
}
