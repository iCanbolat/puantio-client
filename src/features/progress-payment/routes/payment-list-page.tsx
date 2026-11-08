import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { monthTitle } from "@/features/contracts"
import { Can } from "@/entities/session"
import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatMoney } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"

import { progressPaymentQueries } from "../api/progress-payment-api"
import { NewPaymentDialog } from "../components/new-payment-dialog"
import { PaymentStatusBadge } from "../components/payment-ui"
import {
  PROGRESS_PAYMENT_STATUSES,
  PROGRESS_PAYMENT_STATUS_LABELS,
  progressPaymentListParamsSchema,
  type ProgressPaymentStatus,
  type ProgressPaymentSummary,
} from "../model/progress-payment"

const helper = createDataTableColumnHelper<ProgressPaymentSummary>()

const columns = helper.columns([
  helper.accessor("number", {
    header: "No",
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        to={paths.progressPayments.detail(row.original.id)}
        className="font-mono text-xs font-medium hover:underline"
      >
        {row.original.number}
      </Link>
    ),
    meta: { label: "No" },
    enableHiding: false,
  }),
  helper.accessor("month", {
    header: "Dönem",
    enableSorting: false,
    cell: (info) => (
      <span className="capitalize">{monthTitle(info.getValue())}</span>
    ),
    meta: { label: "Dönem", exportValue: (row) => row.month },
  }),
  helper.accessor("contractTitle", {
    header: "Sözleşme",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="flex min-w-56 flex-col">
        <span>{row.original.contractTitle}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.contractCode} · {row.original.customerName}
        </span>
      </span>
    ),
    meta: { label: "Sözleşme" },
  }),
  helper.accessor("total", {
    header: "Toplam (KDV dahil)",
    enableSorting: false,
    cell: (info) => (
      <span className="tabular-nums">{formatMoney(info.getValue())}</span>
    ),
    meta: {
      label: "Toplam",
      align: "right",
      exportValue: (row) => formatMoney(row.total),
    },
  }),
  helper.accessor("status", {
    header: "Durum",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="flex flex-wrap gap-1">
        <PaymentStatusBadge status={row.original.status} />
        {row.original.isStale ? (
          <StatusBadge tone="danger">Güncel değil</StatusBadge>
        ) : null}
      </span>
    ),
    meta: {
      label: "Durum",
      exportValue: (row) => PROGRESS_PAYMENT_STATUS_LABELS[row.status],
    },
  }),
])

export function PaymentListPage() {
  const [params, setParams, resetParams] = useSearchParamsState(
    progressPaymentListParamsSchema
  )
  const query = useQuery(progressPaymentQueries.list(params))
  const [creating, setCreating] = useState(false)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hakediş"
        description="Aylık hakediş: fiili kişi-gün × birim fiyat, eksik personel kesintisi, fazla mesai, fiyat farkı, ceza ve KDV."
        actions={
          <Can permission="progress_payment:approve">
            <Button
              onClick={() => {
                setCreating(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Yeni hakediş
            </Button>
          </Can>
        }
      />
      <DataTable
        tableId="hakedisler"
        caption="Hakedişler"
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
            searchPlaceholder="Hakediş veya sözleşme ara…"
            searchLabel="Hakedişlerde ara"
            activeFilterCount={
              [params.status, params.contractId].filter(Boolean).length
            }
            onReset={resetParams}
          >
            <EnumFilter<ProgressPaymentStatus>
              label="Durum filtresi"
              allLabel="Tüm durumlar"
              value={params.status}
              options={PROGRESS_PAYMENT_STATUSES}
              labels={PROGRESS_PAYMENT_STATUS_LABELS}
              onChange={(status) => {
                setParams({ status, page: 1 })
              }}
            />
          </FilterBar>
        }
      />
      <NewPaymentDialog
        open={creating}
        defaultContractId={params.contractId}
        onClose={() => {
          setCreating(false)
        }}
      />
    </div>
  )
}
