import { useQuery } from "@tanstack/react-query"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { z } from "zod"

import {
  LEAVE_STATUSES,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  leaveListParamsSchema,
  leaveQueries,
  type Leave,
  type LeaveStatus,
  type LeaveType,
} from "@/entities/leave"
import { OrgUnitSelect } from "@/entities/org-unit"
import { Can, useCan } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDate, formatDateTime } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs"

import { LeaveCalendar } from "../components/leave-calendar"
import { LeaveDecisionDialog } from "../components/leave-decision-dialog"
import { LeaveRequestDialog } from "../components/leave-request-dialog"
import { LEAVE_STATUS_TONES } from "../components/leave-status"

const viewSchema = leaveListParamsSchema.extend({
  gorunum: z.enum(["liste", "takvim"]).catch("liste"),
})

const helper = createDataTableColumnHelper<Leave>()

function createColumns(actions: {
  canApprove: boolean
  onDecide: (leave: Leave, decision: "approve" | "reject") => void
}) {
  return helper.columns([
    helper.accessor("personnelName", {
      header: "Personel",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex min-w-40 flex-col">
          <span className="font-medium">{row.original.personnelName}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.employeeNumber}
            {row.original.locationName ? ` · ${row.original.locationName}` : ""}
          </span>
        </span>
      ),
      meta: { label: "Personel" },
    }),
    helper.accessor("type", {
      header: "Tür",
      enableSorting: false,
      cell: (info) => LEAVE_TYPE_LABELS[info.getValue()],
      meta: { label: "Tür", exportValue: (row) => LEAVE_TYPE_LABELS[row.type] },
    }),
    helper.accessor("startDate", {
      header: "Tarih aralığı",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDate(row.original.startDate)} –{" "}
          {formatDate(row.original.endDate)}
        </span>
      ),
      meta: {
        label: "Tarih aralığı",
        exportValue: (row) =>
          `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`,
      },
    }),
    helper.accessor("days", {
      header: "İş günü",
      enableSorting: false,
      cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
      meta: { label: "İş günü", align: "right" },
    }),
    helper.accessor("status", {
      header: "Durum",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-col gap-0.5">
          <StatusBadge tone={LEAVE_STATUS_TONES[row.original.status]}>
            {LEAVE_STATUS_LABELS[row.original.status]}
          </StatusBadge>
          {row.original.decisionNote ? (
            <span className="max-w-48 truncate text-xs text-muted-foreground">
              {row.original.decisionNote}
            </span>
          ) : null}
        </span>
      ),
      meta: {
        label: "Durum",
        exportValue: (row) => LEAVE_STATUS_LABELS[row.status],
      },
    }),
    helper.accessor("requestedAt", {
      header: "Talep",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-col text-xs">
          <span>{row.original.requestedBy}</span>
          <span className="text-muted-foreground tabular-nums">
            {formatDateTime(row.original.requestedAt)}
          </span>
        </span>
      ),
      meta: { label: "Talep eden", exportValue: (row) => row.requestedBy },
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">İşlemler</span>,
      cell: ({ row }) =>
        actions.canApprove && row.original.status === "pending" ? (
          <span className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                actions.onDecide(row.original, "approve")
              }}
              aria-label={`${row.original.personnelName} iznini onayla`}
            >
              <CheckIcon data-icon="inline-start" />
              Onayla
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                actions.onDecide(row.original, "reject")
              }}
              aria-label={`${row.original.personnelName} iznini reddet`}
            >
              <XIcon data-icon="inline-start" />
              Reddet
            </Button>
          </span>
        ) : null,
      enableHiding: false,
    }),
  ])
}

export function LeavePage() {
  const terms = useTerms()
  const [params, setParams, resetParams] = useSearchParamsState(viewSchema)
  const { gorunum, ...listParams } = params
  const query = useQuery({
    ...leaveQueries.list(listParams),
    enabled: gorunum === "liste",
  })
  const canApprove = useCan("leave:approve")
  const [creating, setCreating] = useState(false)
  const [decision, setDecision] = useState<{
    leave: Leave
    decision: "approve" | "reject"
  } | null>(null)
  const columns = useMemo(
    () =>
      createColumns({
        canApprove,
        onDecide: (leave, next) => {
          setDecision({ leave, decision: next })
        },
      }),
    [canApprove]
  )
  const activeFilterCount = [
    params.status,
    params.type,
    params.orgUnitId,
  ].filter(Boolean).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="İzin ve raporlar"
        description="Yıllık izin, mazeret, ücretsiz izin ve sağlık raporları. Sağlık raporunda yalnızca tarih aralığı tutulur (KVKK)."
        actions={
          <Can permission="leave:request">
            <Button
              onClick={() => {
                setCreating(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Yeni izin
            </Button>
          </Can>
        }
      />
      <Tabs
        value={gorunum}
        onValueChange={(value) => {
          setParams({ gorunum: value as "liste" | "takvim" })
        }}
      >
        <TabsList>
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="takvim">Takvim</TabsTrigger>
        </TabsList>
      </Tabs>
      {gorunum === "takvim" ? (
        <div className="flex flex-col gap-3">
          <OrgUnitSelect
            allowAll
            value={params.orgUnitId ?? null}
            onValueChange={(orgUnitId) => {
              setParams({ orgUnitId: orgUnitId ?? undefined })
            }}
            className="h-8 w-56"
            aria-label={`${terms.orgLevels[0]?.singular ?? "Bölge"} filtresi`}
          />
          <LeaveCalendar
            month={params.month}
            orgUnitId={params.orgUnitId}
            onMonthChange={(month) => {
              setParams({ month })
            }}
          />
        </div>
      ) : (
        <DataTable
          tableId="izinler"
          caption="İzin listesi"
          columns={columns}
          data={query.data?.items}
          meta={query.data?.meta}
          state={listParams}
          onStateChange={(patch) => {
            setParams(patch)
          }}
          getRowId={(row) => row.id}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          enableCsvExport
          toolbar={
            <FilterBar
              search={params.q}
              onSearchChange={(q) => {
                setParams({ q, page: 1 }, { replace: true })
              }}
              searchPlaceholder="Personel adı veya sicil ara…"
              searchLabel="İzinlerde ara"
              activeFilterCount={activeFilterCount}
              onReset={resetParams}
            >
              <OrgUnitSelect
                allowAll
                value={params.orgUnitId ?? null}
                onValueChange={(orgUnitId) => {
                  setParams({ orgUnitId: orgUnitId ?? undefined, page: 1 })
                }}
                className="h-8 w-48"
                aria-label={`${terms.orgLevels[0]?.singular ?? "Bölge"} filtresi`}
              />
              <EnumFilter<LeaveStatus>
                label="Durum filtresi"
                allLabel="Tüm durumlar"
                value={params.status}
                options={LEAVE_STATUSES}
                labels={LEAVE_STATUS_LABELS}
                onChange={(status) => {
                  setParams({ status, page: 1 })
                }}
                className="w-40"
              />
              <EnumFilter<LeaveType>
                label="Tür filtresi"
                allLabel="Tüm türler"
                value={params.type}
                options={LEAVE_TYPES}
                labels={LEAVE_TYPE_LABELS}
                onChange={(type) => {
                  setParams({ type, page: 1 })
                }}
                className="w-40"
              />
            </FilterBar>
          }
        />
      )}
      <LeaveRequestDialog
        open={creating}
        onClose={() => {
          setCreating(false)
        }}
      />
      <LeaveDecisionDialog
        leave={decision?.leave ?? null}
        decision={decision?.decision ?? "approve"}
        onClose={() => {
          setDecision(null)
        }}
      />
    </div>
  )
}
