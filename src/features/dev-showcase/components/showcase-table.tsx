import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, Trash2Icon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { AsyncCombobox } from "@/shared/components/async-combobox"
import { ConfirmDialog } from "@/shared/components/confirm-dialog"
import {
  DataTable,
  DataTableColumnHeader,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { DateRangePicker } from "@/shared/components/date-range-picker"
import { FilterBar } from "@/shared/components/filter-bar"
import { StatusBadge, type StatusTone } from "@/shared/components/status-badge"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime, formatMoney, formatNumber } from "@/shared/lib/format"
import { fromKurus } from "@/shared/lib/money"
import { Button } from "@/shared/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"

import {
  deleteShowcaseRecord,
  fetchCitySuggestions,
  showcaseKeys,
  showcaseQueries,
} from "../api/showcase-api"
import {
  CATEGORY_LABELS,
  SHOWCASE_STATUSES,
  STATUS_LABELS,
  showcaseListParamsSchema,
  type ShowcaseRecord,
  type ShowcaseRecordId,
  type ShowcaseStatus,
} from "../model/showcase-record"
import { RecordEditDialog } from "./record-edit-dialog"

const STATUS_TONES: Record<ShowcaseStatus, StatusTone> = {
  aktif: "success",
  askida: "warning",
  pasif: "neutral",
}

const ALL = "__all"
const STATUS_ITEMS = [
  { value: ALL, label: "Tüm durumlar" },
  ...SHOWCASE_STATUSES.map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
  })),
]

const helper = createDataTableColumnHelper<ShowcaseRecord>()

interface RowActions {
  onEdit: (record: ShowcaseRecord) => void
  onDelete: (record: ShowcaseRecord) => void
}

const createColumns = ({ onEdit, onDelete }: RowActions) =>
  helper.columns([
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
        <DataTableColumnHeader column={column} title="Ad" />
      ),
      cell: ({ row }) => (
        <span className="flex min-w-48 flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {CATEGORY_LABELS[row.original.category]}
          </span>
        </span>
      ),
      meta: { label: "Ad" },
    }),
    helper.accessor("city", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Şehir" />
      ),
      meta: { label: "Şehir" },
    }),
    helper.accessor("status", {
      header: "Durum",
      enableSorting: false,
      cell: (info) => (
        <StatusBadge tone={STATUS_TONES[info.getValue()]}>
          {STATUS_LABELS[info.getValue()]}
        </StatusBadge>
      ),
      meta: { label: "Durum", exportValue: (row) => STATUS_LABELS[row.status] },
    }),
    helper.accessor("score", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Puan" />
      ),
      cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
      meta: { label: "Puan", align: "right" },
    }),
    helper.accessor("headcount", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Kadro" />
      ),
      cell: (info) => (
        <span className="tabular-nums">{formatNumber(info.getValue())}</span>
      ),
      meta: { label: "Kadro", align: "right" },
    }),
    helper.accessor("monthlyAmount", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Aylık tutar" />
      ),
      cell: (info) => (
        <span className="tabular-nums">{formatMoney(info.getValue())}</span>
      ),
      meta: {
        label: "Aylık tutar",
        align: "right",
        exportValue: (row) =>
          fromKurus(row.monthlyAmount).toFixed(2).replace(".", ","),
      },
    }),
    helper.accessor("updatedAt", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Güncelleme" />
      ),
      cell: (info) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDateTime(info.getValue())}
        </span>
      ),
      meta: {
        label: "Güncelleme",
        exportValue: (row) => formatDateTime(row.updatedAt),
      },
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">İşlemler</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${row.original.code} kaydını düzenle`}
            onClick={() => {
              onEdit(row.original)
            }}
          >
            <PencilIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${row.original.code} kaydını sil`}
            onClick={() => {
              onDelete(row.original)
            }}
          >
            <Trash2Icon />
          </Button>
        </div>
      ),
      enableHiding: false,
      meta: { label: "İşlemler", align: "right" },
    }),
  ])

export function ShowcaseTable() {
  const [params, setParams, resetParams] = useSearchParamsState(
    showcaseListParamsSchema
  )
  // Satır başına diyalog yerine tek kontrollü düzenleme/silme diyaloğu
  const [editing, setEditing] = useState<ShowcaseRecord | null>(null)
  const [deleting, setDeleting] = useState<ShowcaseRecord | null>(null)
  const columns = useMemo(
    () => createColumns({ onEdit: setEditing, onDelete: setDeleting }),
    []
  )
  const deleteOne = useMutation({
    mutationFn: (record: ShowcaseRecord) => deleteShowcaseRecord(record.id),
    meta: { invalidates: [showcaseKeys.lists()] },
    onSuccess: (_data, record) => {
      toast.success(`${record.code} silindi`)
    },
  })
  const query = useQuery(showcaseQueries.list(params))
  const queryClient = useQueryClient()
  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((id) => deleteShowcaseRecord(id as ShowcaseRecordId))
      ),
    meta: { successMessage: "Seçilen kayıtlar silindi" },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: showcaseKeys.lists() }),
  })

  const activeFilterCount = [
    params.status,
    params.category?.length ? params.category : undefined,
    params.city,
    params.updatedFrom ?? params.updatedTo,
  ].filter(Boolean).length

  return (
    <>
      <DataTable
        tableId="vitrin-kayitlari"
        caption="Vitrin kayıtları"
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
        enableRowSelection
        enableCsvExport
        renderBulkActions={({ selectedIds, clearSelection }) => (
          <ConfirmDialog
            trigger={
              <Button variant="destructive" size="sm">
                <Trash2Icon data-icon="inline-start" />
                Seçilenleri sil ({selectedIds.length})
              </Button>
            }
            title={`${selectedIds.length} kayıt silinsin mi?`}
            description="Seçilen kayıtlar kalıcı olarak silinecek."
            confirmLabel="Sil"
            destructive
            onConfirm={async () => {
              await bulkDelete.mutateAsync(selectedIds)
              clearSelection()
            }}
          />
        )}
        toolbar={
          <FilterBar
            search={params.q}
            onSearchChange={(q) => {
              setParams({ q, page: 1 }, { replace: true })
            }}
            searchPlaceholder="Kod, ad veya şehir ara…"
            searchLabel="Kayıtlarda ara"
            activeFilterCount={activeFilterCount}
            onReset={resetParams}
          >
            <Select
              value={params.status ?? ALL}
              onValueChange={(value) => {
                setParams({
                  status: value === ALL ? undefined : (value as ShowcaseStatus),
                  page: 1,
                })
              }}
              items={STATUS_ITEMS}
            >
              <SelectTrigger
                size="sm"
                className="w-40"
                aria-label="Durum filtresi"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AsyncCombobox
              aria-label="Şehir filtresi"
              placeholder="Şehir seç…"
              queryKey={showcaseKeys.cities()}
              fetchOptions={fetchCitySuggestions}
              value={params.city ?? null}
              onValueChange={(city) => {
                setParams({ city: city ?? undefined, page: 1 })
              }}
              className="w-48"
            />
            <DateRangePicker
              label="Güncelleme tarihi"
              placeholder="Güncelleme tarihi"
              value={{ from: params.updatedFrom, to: params.updatedTo }}
              onChange={(range) => {
                setParams({
                  updatedFrom: range.from,
                  updatedTo: range.to,
                  page: 1,
                })
              }}
            />
          </FilterBar>
        }
      />
      <RecordEditDialog
        record={editing}
        onClose={() => {
          setEditing(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Kayıt silinsin mi?"
        description={
          deleting
            ? `${deleting.code} · ${deleting.name} kalıcı olarak silinecek. Bu işlem geri alınamaz.`
            : undefined
        }
        confirmLabel="Sil"
        destructive
        onConfirm={() =>
          deleting ? deleteOne.mutateAsync(deleting) : undefined
        }
      />
    </>
  )
}
