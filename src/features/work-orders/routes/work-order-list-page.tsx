import { useQuery } from "@tanstack/react-query"
import { KanbanSquareIcon, ListIcon, PlusIcon, WifiOffIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { z } from "zod"

import { Can, useCan } from "@/entities/session"
import { usePollingFallback } from "@/shared/api/realtime-hooks"
import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EmptyState } from "@/shared/components/empty-state"
import { EnumFilter } from "@/shared/components/enum-filter"
import { ErrorState } from "@/shared/components/error-state"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"

import { workOrderQueries } from "../api/work-order-api"
import { CreateWorkOrderDialog } from "../components/create-work-order-dialog"
import { KanbanBoard } from "../components/kanban-board"
import { TransitionDialog } from "../components/transition-dialog"
import {
  WorkOrderPriorityBadge,
  WorkOrderSla,
  WorkOrderStatusBadge,
} from "../components/work-order-ui"
import {
  OPEN_STATUSES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_SOURCES,
  WORK_ORDER_SOURCE_LABELS,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  workOrderListParamsSchema,
  type WorkOrderAction,
  type WorkOrderPriority,
  type WorkOrderSource,
  type WorkOrderStatus,
  type WorkOrderSummary,
} from "../model/work-order"

/** Realtime koparsa pano ve liste bu aralıkla yenilenir */
export const WORK_ORDER_POLL_MS = 15_000

const pageParamsSchema = workOrderListParamsSchema.extend({
  gorunum: z.enum(["liste", "kanban"]).catch("liste"),
})

const STATE_LABELS = {
  open: "Yalnızca açıklar",
  overdue: "SLA'sı aşılanlar",
} as const

const helper = createDataTableColumnHelper<WorkOrderSummary>()

const columns = helper.columns([
  helper.accessor("number", {
    header: "İş emri",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <span className="flex min-w-56 flex-col">
        <Link
          to={paths.workOrders.detail(row.original.id)}
          className="font-medium hover:underline"
        >
          {row.original.title}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.number}
          {row.original.reportCount > 1
            ? ` · ${String(row.original.reportCount)} bildirim`
            : ""}
        </span>
      </span>
    ),
    meta: {
      label: "İş emri",
      exportValue: (row) => `${row.number} ${row.title}`,
    },
  }),
  helper.accessor("locationName", {
    header: "Lokasyon",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="flex min-w-40 flex-col">
        <span>{row.original.locationName}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.areaName ?? row.original.customerName}
        </span>
      </span>
    ),
    meta: { label: "Lokasyon" },
  }),
  helper.accessor("priority", {
    header: "Öncelik",
    enableSorting: false,
    cell: (info) => <WorkOrderPriorityBadge priority={info.getValue()} />,
    meta: {
      label: "Öncelik",
      exportValue: (row) => WORK_ORDER_PRIORITY_LABELS[row.priority],
    },
  }),
  helper.accessor("status", {
    header: "Durum",
    enableSorting: false,
    cell: (info) => <WorkOrderStatusBadge status={info.getValue()} />,
    meta: {
      label: "Durum",
      exportValue: (row) => WORK_ORDER_STATUS_LABELS[row.status],
    },
  }),
  helper.accessor("dueAt", {
    header: "SLA",
    enableSorting: false,
    cell: ({ row }) => <WorkOrderSla order={row.original} />,
    meta: {
      label: "SLA",
      exportValue: (row) =>
        `${formatDateTime(row.dueAt)}${row.slaBreached ? " (aşıldı)" : ""}`,
    },
  }),
  helper.accessor("assigneeName", {
    header: "Atanan",
    enableSorting: false,
    cell: (info) =>
      info.getValue() ?? <span className="text-muted-foreground">—</span>,
    meta: { label: "Atanan", exportValue: (row) => row.assigneeName ?? "" },
  }),
  helper.accessor("source", {
    header: "Kaynak",
    enableSorting: false,
    cell: (info) => WORK_ORDER_SOURCE_LABELS[info.getValue()],
    meta: {
      label: "Kaynak",
      exportValue: (row) => WORK_ORDER_SOURCE_LABELS[row.source],
    },
  }),
  helper.accessor("createdAt", {
    header: "Açılış",
    cell: (info) => (
      <span className="whitespace-nowrap">
        {formatDateTime(info.getValue())}
      </span>
    ),
    meta: { label: "Açılış" },
  }),
])

export function WorkOrderListPage() {
  const [params, setParams, resetParams] =
    useSearchParamsState(pageParamsSchema)
  const { gorunum, ...apiParams } = params
  const pollInterval = usePollingFallback(WORK_ORDER_POLL_MS)
  const canWrite = useCan("work_order:write")
  const [creating, setCreating] = useState(false)
  const [pending, setPending] = useState<{
    order: WorkOrderSummary
    action: WorkOrderAction
  } | null>(null)
  const filters = (
    <FilterBar
      search={params.q}
      onSearchChange={(q) => {
        setParams({ q, page: 1 }, { replace: true })
      }}
      searchPlaceholder="No, başlık veya lokasyon ara…"
      searchLabel="İş emirlerinde ara"
      activeFilterCount={
        [params.status, params.priority, params.source, params.state].filter(
          Boolean
        ).length
      }
      onReset={() => {
        resetParams()
        setParams({ gorunum })
      }}
    >
      <EnumFilter<"open" | "overdue">
        label="Açıklık filtresi"
        allLabel="Tümü"
        value={params.state}
        options={["open", "overdue"] as const}
        labels={STATE_LABELS}
        onChange={(state) => {
          setParams({ state, page: 1 })
        }}
      />
      {gorunum === "liste" ? (
        <EnumFilter<WorkOrderStatus>
          label="Durum filtresi"
          allLabel="Tüm durumlar"
          value={params.status}
          options={WORK_ORDER_STATUSES}
          labels={WORK_ORDER_STATUS_LABELS}
          onChange={(status) => {
            setParams({ status, page: 1 })
          }}
        />
      ) : null}
      <EnumFilter<WorkOrderPriority>
        label="Öncelik filtresi"
        allLabel="Tüm öncelikler"
        value={params.priority}
        options={WORK_ORDER_PRIORITIES}
        labels={WORK_ORDER_PRIORITY_LABELS}
        onChange={(priority) => {
          setParams({ priority, page: 1 })
        }}
      />
      <EnumFilter<WorkOrderSource>
        label="Kaynak filtresi"
        allLabel="Tüm kaynaklar"
        value={params.source}
        options={WORK_ORDER_SOURCES}
        labels={WORK_ORDER_SOURCE_LABELS}
        onChange={(source) => {
          setParams({ source, page: 1 })
        }}
      />
    </FilterBar>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="İş emirleri"
        description="QR bildirimleri, kritik denetim maddeleri, müşteri talepleri ve manuel kayıtlar. SLA'sı aşılanlar en üstte."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {pollInterval ? (
              <StatusBadge tone="warning">
                <WifiOffIcon className="size-3.5" aria-hidden />
                Canlı bağlantı yok
              </StatusBadge>
            ) : null}
            <div
              role="group"
              aria-label="Görünüm"
              className="flex rounded-md border p-0.5"
            >
              <Button
                size="sm"
                variant={gorunum === "liste" ? "secondary" : "ghost"}
                aria-pressed={gorunum === "liste"}
                onClick={() => {
                  setParams({ gorunum: "liste" })
                }}
              >
                <ListIcon data-icon="inline-start" />
                Liste
              </Button>
              <Button
                size="sm"
                variant={gorunum === "kanban" ? "secondary" : "ghost"}
                aria-pressed={gorunum === "kanban"}
                onClick={() => {
                  setParams({ gorunum: "kanban", status: undefined })
                }}
              >
                <KanbanSquareIcon data-icon="inline-start" />
                Pano
              </Button>
            </div>
            <Can permission="work_order:write">
              <Button
                onClick={() => {
                  setCreating(true)
                }}
              >
                <PlusIcon data-icon="inline-start" />
                Yeni iş emri
              </Button>
            </Can>
          </div>
        }
      />
      {gorunum === "kanban" ? (
        <BoardView
          params={apiParams}
          pollInterval={pollInterval}
          canWrite={canWrite}
          toolbar={filters}
          onAction={(order, action) => {
            setPending({ order, action })
          }}
        />
      ) : (
        <ListView
          params={apiParams}
          pollInterval={pollInterval}
          toolbar={filters}
          setParams={setParams}
        />
      )}
      <TransitionDialog
        order={pending?.order ?? null}
        action={pending?.action ?? null}
        onClose={() => {
          setPending(null)
        }}
      />
      <CreateWorkOrderDialog
        open={creating}
        onClose={() => {
          setCreating(false)
        }}
      />
    </div>
  )
}

type ApiParams = z.infer<typeof workOrderListParamsSchema>
type SetParams = ReturnType<
  typeof useSearchParamsState<typeof pageParamsSchema>
>[1]

function ListView({
  params,
  pollInterval,
  toolbar,
  setParams,
}: {
  params: ApiParams
  pollInterval: number | false
  toolbar: ReactNode
  setParams: SetParams
}) {
  const query = useQuery({
    ...workOrderQueries.list(params),
    refetchInterval: pollInterval,
  })
  return (
    <DataTable
      tableId="is-emirleri"
      caption="İş emirleri"
      columns={columns}
      data={query.data?.items}
      meta={query.data?.meta}
      state={params}
      onStateChange={(patch) => {
        setParams(patch)
      }}
      getRowId={(row) => row.id}
      getRowClassName={(row) =>
        row.slaBreached && OPEN_STATUSES.includes(row.status)
          ? "sla-breached shadow-[inset_4px_0_0_0_var(--color-red-600)]"
          : undefined
      }
      isLoading={query.isPending}
      isFetching={query.isFetching}
      error={query.error}
      onRetry={() => void query.refetch()}
      enableCsvExport
      toolbar={toolbar}
    />
  )
}

function BoardView({
  params,
  pollInterval,
  canWrite,
  toolbar,
  onAction,
}: {
  params: ApiParams
  pollInterval: number | false
  canWrite: boolean
  toolbar: ReactNode
  onAction: (order: WorkOrderSummary, action: WorkOrderAction) => void
}) {
  const query = useQuery({
    ...workOrderQueries.board(params),
    refetchInterval: pollInterval,
  })
  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={KanbanSquareIcon}
          title="İş emri yok"
          description="Filtrelere uyan açık ya da son 7 günde kapanan iş emri bulunmuyor."
        />
      ) : (
        <>
          <KanbanBoard
            orders={query.data.items}
            canWrite={canWrite}
            onAction={onAction}
          />
          {query.data.truncated > 0 ? (
            <p className="text-sm text-muted-foreground">
              {query.data.truncated} iş emri daha var; filtreleri daraltın veya
              liste görünümünü kullanın.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
