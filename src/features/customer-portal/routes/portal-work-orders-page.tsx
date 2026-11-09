import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { Link } from "react-router"

import {
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  WorkOrderSla,
  WorkOrderStatusBadge,
  workOrderListParamsSchema,
  workOrderQueries,
  type WorkOrderStatus,
  type WorkOrderSummary,
} from "@/features/work-orders"
import { Can } from "@/entities/session"
import { usePollingFallback } from "@/shared/api/realtime-hooks"
import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime } from "@/shared/lib/format"
import { buttonVariants } from "@/shared/ui/button"

const helper = createDataTableColumnHelper<WorkOrderSummary>()

const columns = helper.columns([
  helper.accessor("title", {
    header: "İş emri",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <span className="flex min-w-48 flex-col">
        <Link
          to={paths.portal.workOrder(row.original.id)}
          className="font-medium hover:underline"
        >
          {row.original.title}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.number}
        </span>
      </span>
    ),
    meta: { label: "İş emri" },
  }),
  helper.accessor("locationName", {
    header: "Lokasyon",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="flex min-w-40 flex-col">
        <span>{row.original.locationName}</span>
        {row.original.areaName ? (
          <span className="text-xs text-muted-foreground">
            {row.original.areaName}
          </span>
        ) : null}
      </span>
    ),
    meta: { label: "Lokasyon" },
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
    meta: { label: "SLA", exportValue: (row) => formatDateTime(row.dueAt) },
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

/** Müşterinin kendi lokasyonlarındaki iş emirleri (kapsamı sunucu uygular) */
export function PortalWorkOrdersPage() {
  const [params, setParams, resetParams] = useSearchParamsState(
    workOrderListParamsSchema
  )
  const pollInterval = usePollingFallback(15_000)
  const query = useQuery({
    ...workOrderQueries.list(params),
    refetchInterval: pollInterval,
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="İş emirleri"
        description="QR bildirimleri, talepleriniz ve denetim bulgularından açılan iş emirleri."
        actions={
          <Can permission="work_order:request">
            <Link to={paths.portal.request()} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              Talep aç
            </Link>
          </Can>
        }
      />
      <DataTable
        tableId="portal-is-emirleri"
        caption="İş emirleri"
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        state={params}
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
            searchPlaceholder="No, başlık veya lokasyon ara…"
            searchLabel="İş emirlerinde ara"
            activeFilterCount={
              [params.status, params.state].filter(Boolean).length
            }
            onReset={resetParams}
          >
            <EnumFilter<"open" | "overdue">
              label="Açıklık filtresi"
              allLabel="Tümü"
              value={params.state}
              options={["open", "overdue"] as const}
              labels={{ open: "Yalnızca açıklar", overdue: "SLA'sı aşılanlar" }}
              onChange={(state) => {
                setParams({ state, page: 1 })
              }}
            />
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
          </FilterBar>
        }
      />
    </div>
  )
}
