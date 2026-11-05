import { useQuery } from "@tanstack/react-query"
import { ArrowRightIcon } from "lucide-react"
import { Link } from "react-router"
import { z } from "zod"

import { legalEntityQueries } from "@/entities/legal-entity"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { buttonVariants } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import { timesheetQueries } from "../api/timesheet-api"
import { PERIOD_STATUS_TONES, monthLabel } from "../components/period-format"
import { PERIOD_STATUS_LABELS } from "../model/timesheet"

const ALL = "__all__"
const paramsSchema = z.object({
  tuzel: z.string().min(1).optional().catch(undefined),
})

export function PeriodsPage() {
  const [params, setParams] = useSearchParamsState(paramsSchema)
  const entities = useQuery(legalEntityQueries.list())
  const query = useQuery(timesheetQueries.periods(params.tuzel))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Puantaj"
        description="Dönemler tüzel kişilik bazında açılır ve kilitlenir: Açık → Bölge onayı → (personel temininde) Müşteri onayı → İK onayı → Kilitli."
      />
      {(entities.data?.length ?? 0) > 1 ? (
        <SimpleSelect
          aria-label="Tüzel kişilik filtresi"
          className="w-80"
          value={params.tuzel ?? ALL}
          onChange={(value) => {
            setParams({ tuzel: value === ALL ? undefined : value })
          }}
          options={[
            { value: ALL, label: "Tüm tüzel kişilikler" },
            ...(entities.data ?? []).map((entity) => ({
              value: entity.id,
              label: entity.title,
            })),
          ]}
        />
      ) : null}
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="Dönem yok" />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableCaption className="sr-only">Puantaj dönemleri</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Dönem</TableHead>
                <TableHead>Tüzel kişilik</TableHead>
                <TableHead className="text-right">Personel</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>
                  <span className="sr-only">Aç</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((period) => (
                <TableRow key={period.id}>
                  <TableCell className="font-medium capitalize">
                    {monthLabel(period.month)}
                  </TableCell>
                  <TableCell>{period.legalEntityTitle}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {period.personnelCount}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1">
                      <StatusBadge tone={PERIOD_STATUS_TONES[period.status]}>
                        {PERIOD_STATUS_LABELS[period.status]}
                      </StatusBadge>
                      {period.customerApprovalRequired ? (
                        <StatusBadge tone="info">
                          Müşteri onaylı dönem
                        </StatusBadge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={paths.timesheet.period(period.id)}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                      aria-label={`${monthLabel(period.month)} ${period.legalEntityTitle} puantajını aç`}
                    >
                      Aç
                      <ArrowRightIcon data-icon="inline-end" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
