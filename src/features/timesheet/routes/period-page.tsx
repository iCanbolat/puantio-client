import { useMutation, useQuery } from "@tanstack/react-query"
import { DownloadIcon, LockIcon } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"

import { LocationCombobox } from "@/entities/location"
import { OrgUnitSelect } from "@/entities/org-unit"
import { Can, useSession } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import { ConfirmDialog } from "@/shared/components/confirm-dialog"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDate, formatDateTime } from "@/shared/lib/format"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"

import {
  timesheetKeys,
  timesheetQueries,
  transitionPeriod,
} from "../api/timesheet-api"
import { CellEditDialog } from "../components/cell-edit-dialog"
import { PERIOD_STATUS_TONES, monthLabel } from "../components/period-format"
import { PeriodStepper } from "../components/period-ui"
import { TimesheetGrid } from "../components/timesheet-grid"
import { isPeriodEditable, tracksChanges } from "../domain/period"
import { CELL_CODES, CELL_CODE_LABELS } from "../model/cell-code"
import {
  PERIOD_ACTION_LABELS,
  PERIOD_STATUS_LABELS,
  timesheetGridParamsSchema,
  type PeriodAction,
  type TimesheetCell,
  type TimesheetRow,
} from "../model/timesheet"

export function PeriodPage() {
  const { periodId = "" } = useParams()
  const terms = useTerms()
  const me = useSession()
  const [params, setParams, resetParams] = useSearchParamsState(
    timesheetGridParamsSchema
  )
  // Büyük dönemlerde grid bölge/lokasyon seçilmeden yüklenmez; lokasyon kapsamlı
  // kullanıcı (süpervizör) yalnızca birkaç lokasyon gördüğü için filtre gerekmez
  const hasFilter = Boolean(
    params.orgUnitId || params.locationId || me.scope.kind === "locations"
  )
  const periodQuery = useQuery(timesheetQueries.period(periodId))
  const gridQuery = useQuery({
    ...timesheetQueries.grid(periodId, params),
    enabled: hasFilter,
  })
  const [editing, setEditing] = useState<{
    row: TimesheetRow
    cell: TimesheetCell
  } | null>(null)
  const [pendingAction, setPendingAction] = useState<PeriodAction | null>(null)
  const transition = useMutation({
    mutationFn: (action: PeriodAction) => transitionPeriod(periodId, action),
    meta: { invalidates: [timesheetKeys.all] },
  })

  if (periodQuery.isError)
    return (
      <ErrorState
        error={periodQuery.error}
        onRetry={() => void periodQuery.refetch()}
      />
    )
  const period = periodQuery.data
  if (!period) return <Skeleton className="h-96 w-full" />
  const editable =
    isPeriodEditable(period.status) &&
    (me.permissions.includes("timesheet:approve_region") ||
      me.permissions.includes("timesheet:approve_hr"))
  const unresolved =
    gridQuery.data?.rows.filter((row) => row.summary.unresolvedDays > 0)
      .length ?? 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="capitalize">
            {monthLabel(period.month)} puantajı
          </span>
        }
        description={period.legalEntityTitle}
        actions={
          <div className="flex flex-wrap gap-2">
            {period.availableActions.map((action) => (
              <Button
                key={action}
                variant={action === "reopen" ? "outline" : "default"}
                onClick={() => {
                  setPendingAction(action)
                }}
              >
                {action === "lock" ? (
                  <LockIcon data-icon="inline-start" />
                ) : null}
                {PERIOD_ACTION_LABELS[action]}
              </Button>
            ))}
            {period.status === "hr_approved" || period.status === "locked" ? (
              <Can permission="payroll:export">
                <Link
                  to={paths.payroll.exports(period.id)}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <DownloadIcon data-icon="inline-start" />
                  Bordroya aktar
                </Link>
              </Can>
            ) : null}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={PERIOD_STATUS_TONES[period.status]}>
          {PERIOD_STATUS_LABELS[period.status]}
        </StatusBadge>
        <PeriodStepper
          status={period.status}
          customerApprovalRequired={period.customerApprovalRequired}
        />
      </div>
      {period.status === "locked" ? (
        <Alert>
          <LockIcon />
          <AlertTitle>Dönem kilitli</AlertTitle>
          <AlertDescription>
            Puantaj salt okunur. Düzeltme gerekirse İK dönemi yeniden açmalıdır.
          </AlertDescription>
        </Alert>
      ) : period.customerApprovalRequired &&
        period.status === "region_approved" ? (
        <Alert>
          <AlertTitle>Müşteri onayı bekleniyor</AlertTitle>
          <AlertDescription>
            Personel temini hizmeti içeren dönem: müşteri, portaldaki "Puantaj
            onayları" ekranından onaylamalıdır.
          </AlertDescription>
        </Alert>
      ) : null}
      <FilterBar
        search={params.q}
        onSearchChange={(q) => {
          setParams({ q }, { replace: true })
        }}
        searchPlaceholder="Personel adı veya sicil ara…"
        searchLabel="Puantajda ara"
        activeFilterCount={
          [params.orgUnitId, params.locationId].filter(Boolean).length
        }
        onReset={resetParams}
      >
        <OrgUnitSelect
          allowAll
          value={params.orgUnitId ?? null}
          onValueChange={(orgUnitId) => {
            setParams({ orgUnitId: orgUnitId ?? undefined })
          }}
          className="h-8 w-52"
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
      {!hasFilter ? (
        <EmptyState
          title={`Puantajı görmek için ${terms.lower(terms.orgLevels[0] ?? terms.location)} seçin`}
          description="Büyük dönemlerde grid bölge veya lokasyon bazında yüklenir."
        />
      ) : gridQuery.isError ? (
        <ErrorState
          error={gridQuery.error}
          onRetry={() => void gridQuery.refetch()}
        />
      ) : !gridQuery.data ? (
        <Skeleton className="h-[560px] w-full" />
      ) : gridQuery.data.rows.length === 0 ? (
        <EmptyState title="Bu filtrede personel yok" />
      ) : (
        <>
          {unresolved > 0 ? (
            <Alert variant="destructive">
              <AlertDescription>
                {unresolved} personelde kodu belirsiz gün var (eksik çıkış veya
                gelecek gün). Bordro aktarımından önce düzeltin.
              </AlertDescription>
            </Alert>
          ) : null}
          <TimesheetGrid
            grid={gridQuery.data}
            editable={editable}
            onEdit={(row, cell) => {
              setEditing({ row, cell })
            }}
          />
          <p
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
            aria-label="Kod açıklamaları"
          >
            {CELL_CODES.map((code) => (
              <span key={code}>
                <span className="font-mono font-semibold text-foreground">
                  {code}
                </span>{" "}
                {CELL_CODE_LABELS[code]}
              </span>
            ))}
          </p>
        </>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Onay sonrası değişiklikler</CardTitle>
          </CardHeader>
          <CardContent>
            {period.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Bölge onayından sonra değişiklik yapılmadı.
              </p>
            ) : (
              <ul
                className="flex flex-col gap-1 text-sm"
                aria-label="Fark listesi"
              >
                {period.changes.map((change) => (
                  <li
                    key={`${change.at}-${change.personnelName}-${change.date}`}
                  >
                    <span className="font-medium">{change.personnelName}</span>{" "}
                    {formatDate(change.date)}:{" "}
                    <span className="font-mono">{change.before ?? "—"}</span> →{" "}
                    <span className="font-mono font-semibold">
                      {change.after}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      ({change.actor}, {formatDateTime(change.at)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dönem geçmişi</CardTitle>
          </CardHeader>
          <CardContent>
            {period.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Henüz onay adımı yok.
              </p>
            ) : (
              <ol
                className="flex flex-col gap-1 text-sm"
                aria-label="Dönem geçmişi"
              >
                {period.history.map((entry) => (
                  <li key={`${entry.at}-${entry.action}`}>
                    <span className="font-medium">{entry.action}</span> ·{" "}
                    {entry.actor}{" "}
                    <span className="text-muted-foreground">
                      {formatDateTime(entry.at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      <CellEditDialog
        periodId={period.id}
        target={editing}
        tracksChanges={tracksChanges(period.status)}
        onClose={() => {
          setEditing(null)
        }}
      />
      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(next) => {
          if (!next) setPendingAction(null)
        }}
        title={pendingAction ? PERIOD_ACTION_LABELS[pendingAction] : ""}
        description={
          pendingAction === "lock"
            ? "Kilitli dönemde puantaj düzenlenemez. Bordro aktarımı kilitli dönemden yapılır."
            : `${monthLabel(period.month)} · ${period.legalEntityTitle}`
        }
        confirmLabel={
          pendingAction ? PERIOD_ACTION_LABELS[pendingAction] : "Onayla"
        }
        destructive={pendingAction === "reopen"}
        onConfirm={async () => {
          if (pendingAction) await transition.mutateAsync(pendingAction)
          setPendingAction(null)
        }}
      />
    </div>
  )
}
