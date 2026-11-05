import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router"

import {
  CUSTOMER_SECTORS,
  CUSTOMER_SECTOR_LABELS,
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_LABELS,
  customerListParamsSchema,
  customerQueries,
  type Customer,
  type CustomerSector,
  type CustomerStatus,
  type CustomerType,
} from "@/entities/customer"
import { Can } from "@/entities/session"
import {
  DataTable,
  DataTableColumnHeader,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDate, formatNumber } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"

import { CustomerDialog } from "../components/customer-dialog"

const helper = createDataTableColumnHelper<Customer>()

const columns = helper.columns([
  helper.accessor("code", {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Kod" />
    ),
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue()}</span>
    ),
    meta: { label: "Kod" },
    enableHiding: false,
  }),
  helper.accessor("name", {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Müşteri" />
    ),
    cell: ({ row }) => (
      <span className="flex min-w-48 flex-col">
        <Link
          to={paths.customers.detail(row.original.id)}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
        <span className="text-xs text-muted-foreground">
          {CUSTOMER_SECTOR_LABELS[row.original.sector]}
        </span>
      </span>
    ),
    meta: { label: "Müşteri" },
  }),
  helper.accessor("type", {
    header: "Tür",
    enableSorting: false,
    cell: (info) => CUSTOMER_TYPE_LABELS[info.getValue()],
    meta: {
      label: "Tür",
      exportValue: (row) => CUSTOMER_TYPE_LABELS[row.type],
    },
  }),
  helper.accessor("taxNumber", {
    header: "VKN",
    enableSorting: false,
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue() ?? "—"}</span>
    ),
    meta: { label: "VKN" },
  }),
  helper.accessor("locationCount", {
    header: "Lokasyon",
    enableSorting: false,
    cell: (info) => (
      <span className="tabular-nums">{formatNumber(info.getValue())}</span>
    ),
    meta: { label: "Lokasyon", align: "right" },
  }),
  helper.accessor("status", {
    header: "Durum",
    enableSorting: false,
    cell: (info) => (
      <StatusBadge tone={info.getValue() === "active" ? "success" : "neutral"}>
        {CUSTOMER_STATUS_LABELS[info.getValue()]}
      </StatusBadge>
    ),
    meta: {
      label: "Durum",
      exportValue: (row) => CUSTOMER_STATUS_LABELS[row.status],
    },
  }),
  helper.accessor("updatedAt", {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Güncelleme" />
    ),
    cell: (info) => (
      <span className="tabular-nums">{formatDate(info.getValue())}</span>
    ),
    meta: {
      label: "Güncelleme",
      exportValue: (row) => formatDate(row.updatedAt),
    },
  }),
])

export function CustomerListPage() {
  const [params, setParams, resetParams] = useSearchParamsState(
    customerListParamsSchema
  )
  const query = useQuery(customerQueries.list(params))
  const [creating, setCreating] = useState(false)
  const activeFilterCount = useMemo(
    () => [params.type, params.sector, params.status].filter(Boolean).length,
    [params.type, params.sector, params.status]
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Müşteriler"
        description="Hizmet verilen kurumlar. Lokasyonlar ve sözleşmeler müşteriye bağlanır."
        actions={
          <Can permission="customer:write">
            <Button
              onClick={() => {
                setCreating(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Yeni müşteri
            </Button>
          </Can>
        }
      />
      <DataTable
        tableId="musteriler"
        caption="Müşteriler"
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
            searchPlaceholder="Ad, kod veya VKN ara…"
            searchLabel="Müşterilerde ara"
            activeFilterCount={activeFilterCount}
            onReset={resetParams}
          >
            <EnumFilter<CustomerType>
              label="Tür filtresi"
              allLabel="Tüm türler"
              value={params.type}
              options={CUSTOMER_TYPES}
              labels={CUSTOMER_TYPE_LABELS}
              onChange={(type) => {
                setParams({ type, page: 1 })
              }}
            />
            <EnumFilter<CustomerSector>
              label="Sektör filtresi"
              allLabel="Tüm sektörler"
              value={params.sector}
              options={CUSTOMER_SECTORS}
              labels={CUSTOMER_SECTOR_LABELS}
              onChange={(sector) => {
                setParams({ sector, page: 1 })
              }}
            />
            <EnumFilter<CustomerStatus>
              label="Durum filtresi"
              allLabel="Tüm durumlar"
              value={params.status}
              options={CUSTOMER_STATUSES}
              labels={CUSTOMER_STATUS_LABELS}
              onChange={(status) => {
                setParams({ status, page: 1 })
              }}
            />
          </FilterBar>
        }
      />
      <CustomerDialog
        open={creating}
        customer={null}
        onClose={() => {
          setCreating(false)
        }}
      />
    </div>
  )
}
