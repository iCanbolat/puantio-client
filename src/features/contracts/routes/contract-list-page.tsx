import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { Link } from "react-router"

import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  ContractStatusBadge,
  contractListParamsSchema,
  contractQueries,
  type ContractStatus,
  type ContractSummary,
  type ContractType,
} from "@/entities/contract"
import { Can } from "@/entities/session"
import {
  DataTable,
  DataTableColumnHeader,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDate, formatNumber } from "@/shared/lib/format"
import { buttonVariants } from "@/shared/ui/button"

const helper = createDataTableColumnHelper<ContractSummary>()

const columns = helper.columns([
  helper.accessor("code", {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="No" />
    ),
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue()}</span>
    ),
    meta: { label: "No" },
    enableHiding: false,
  }),
  helper.accessor("title", {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Sözleşme" />
    ),
    cell: ({ row }) => (
      <span className="flex min-w-56 flex-col">
        <Link
          to={paths.contracts.detail(row.original.id)}
          className="font-medium hover:underline"
        >
          {row.original.title}
        </Link>
        <span className="text-xs text-muted-foreground">
          {row.original.customerName}
        </span>
      </span>
    ),
    meta: { label: "Sözleşme" },
  }),
  helper.accessor("type", {
    header: "Tip",
    enableSorting: false,
    cell: (info) => CONTRACT_TYPE_LABELS[info.getValue()],
    meta: {
      label: "Tip",
      exportValue: (row) => CONTRACT_TYPE_LABELS[row.type],
    },
  }),
  helper.accessor("contractorTitle", {
    header: "Yüklenici",
    enableSorting: false,
    meta: { label: "Yüklenici" },
  }),
  helper.accessor("startDate", {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dönem" />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {formatDate(row.original.startDate)} –{" "}
        {formatDate(row.original.endDate)}
      </span>
    ),
    meta: {
      label: "Dönem",
      exportValue: (row) => `${row.startDate} – ${row.endDate}`,
    },
  }),
  helper.accessor("committedHeadcount", {
    header: "Taahhüt kadro",
    enableSorting: false,
    cell: (info) => (
      <span className="tabular-nums">{formatNumber(info.getValue())}</span>
    ),
    meta: { label: "Taahhüt kadro", align: "right" },
  }),
  helper.accessor("locationCount", {
    header: "Lokasyon",
    enableSorting: false,
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
    meta: { label: "Lokasyon", align: "right" },
  }),
  helper.accessor("status", {
    header: "Durum",
    enableSorting: false,
    cell: (info) => <ContractStatusBadge status={info.getValue()} />,
    meta: {
      label: "Durum",
      exportValue: (row) => CONTRACT_STATUS_LABELS[row.status],
    },
  }),
])

export function ContractListPage() {
  const [params, setParams, resetParams] = useSearchParamsState(
    contractListParamsSchema
  )
  const query = useQuery(contractQueries.list(params))
  const activeFilterCount = [params.type, params.status].filter(Boolean).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sözleşmeler"
        description="Müşteri sözleşmeleri, zeyilnameler, taahhüt kadro ve birim fiyatlar."
        actions={
          <>
            <Link
              to={paths.contracts.headcount()}
              className={buttonVariants({ variant: "outline" })}
            >
              Kadro raporu
            </Link>
            <Can permission="contract:write">
              <Link to={paths.contracts.new()} className={buttonVariants()}>
                <PlusIcon data-icon="inline-start" />
                Yeni sözleşme
              </Link>
            </Can>
          </>
        }
      />
      <DataTable
        tableId="sozlesmeler"
        caption="Sözleşmeler"
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
            searchPlaceholder="No, ad veya müşteri ara…"
            searchLabel="Sözleşmelerde ara"
            activeFilterCount={activeFilterCount}
            onReset={resetParams}
          >
            <EnumFilter<ContractType>
              label="Tip filtresi"
              allLabel="Tüm tipler"
              value={params.type}
              options={CONTRACT_TYPES}
              labels={CONTRACT_TYPE_LABELS}
              onChange={(type) => {
                setParams({ type, page: 1 })
              }}
            />
            <EnumFilter<ContractStatus>
              label="Durum filtresi"
              allLabel="Tüm durumlar"
              value={params.status}
              options={CONTRACT_STATUSES}
              labels={CONTRACT_STATUS_LABELS}
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
