import {
  functionalUpdate,
  useTable,
  type RowSelectionState,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { DownloadIcon, SearchXIcon } from "lucide-react"
import { useMemo, useRef, useState, type ReactNode } from "react"

import { toIsoDate } from "@/shared/lib/date"
import { csvBlob, downloadBlob, toCsv } from "@/shared/lib/download"
import { cn } from "@/shared/lib/utils"
import { useUiStore } from "@/shared/stores/ui-store"
import type { PaginationMeta } from "@/shared/types"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import { EmptyState } from "../empty-state"
import { ErrorState } from "../error-state"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableViewOptions } from "./data-table-view-options"
import {
  createDataTableColumnHelper,
  dataTableFeatures,
  type DataTableColumns,
  type DataTableQueryState,
  type DataTableStatePatch,
} from "./types"

const EMPTY_ROWS: readonly never[] = []
const EMPTY_HIDDEN: readonly string[] = []
const ALIGN_CLASS = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const

export interface DataTableProps<
  TData extends object,
  TSort extends string = string,
> {
  /** Kolon tercihlerinin saklanması ve CSV dosya adı için benzersiz kimlik */
  tableId: string
  /** Ekran okuyucular için tablo açıklaması */
  caption: string
  columns: DataTableColumns<TData>
  data: readonly TData[] | undefined
  meta: PaginationMeta | undefined
  state: DataTableQueryState<TSort>
  /**
   * Durum güncellemesi. Fonksiyon biçimi en güncel duruma göre hesaplanır (hızlı ardışık
   * tıklamalar). Sıralama kolon kimlikleri `TSort` ile aynı olmalı.
   */
  onStateChange: (patch: DataTableStatePatch<TSort>) => void
  getRowId: (row: TData) => string
  /** İlk yükleme (veri yok) */
  isLoading?: boolean
  /** Arka planda yenileme (eski veri gösterilirken) */
  isFetching?: boolean
  error?: unknown
  onRetry?: () => void
  /** Sol üst araç çubuğu (filtreler) */
  toolbar?: ReactNode
  emptyState?: ReactNode
  enableRowSelection?: boolean
  renderBulkActions?: (context: {
    selectedIds: string[]
    clearSelection: () => void
  }) => ReactNode
  /** Tanımlanırsa görünümdeki satırlar CSV olarak indirilebilir */
  enableCsvExport?: boolean
  /** Uzun sayfalarda satır sanallaştırma (sabit yükseklikli kaydırma alanı) */
  virtualized?: { height: number; estimateRowHeight?: number }
}

export function DataTable<TData extends object, TSort extends string = string>({
  tableId,
  caption,
  columns,
  data,
  meta,
  state,
  onStateChange,
  getRowId,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  toolbar,
  emptyState,
  enableRowSelection = false,
  renderBulkActions,
  enableCsvExport = false,
  virtualized,
}: DataTableProps<TData, TSort>) {
  const hiddenColumns =
    useUiStore((store) => store.hiddenColumns[tableId]) ?? EMPTY_HIDDEN
  const setHiddenColumns = useUiStore((store) => store.setHiddenColumns)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const sorting = useMemo(
    () =>
      state.sort ? [{ id: state.sort, desc: state.order === "desc" }] : [],
    [state.sort, state.order]
  )
  const pagination = useMemo(
    () => ({ pageIndex: state.page - 1, pageSize: state.pageSize }),
    [state.page, state.pageSize]
  )
  const columnVisibility = useMemo(
    () => Object.fromEntries(hiddenColumns.map((id) => [id, false])),
    [hiddenColumns]
  )

  const allColumns = useMemo<DataTableColumns<TData>>(() => {
    if (!enableRowSelection) return columns
    const helper = createDataTableColumnHelper<TData>()
    const selectColumn = helper.display({
      id: "__select",
      enableSorting: false,
      enableHiding: false,
      meta: { headerClassName: "w-10", cellClassName: "w-10" },
      header: ({ table }) => (
        <Checkbox
          aria-label="Sayfadaki tüm satırları seç"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() &&
            !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(checked) => {
            table.toggleAllPageRowsSelected(checked)
          }}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Satırı seç"
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => {
            row.toggleSelected(checked)
          }}
        />
      ),
    })
    return [selectColumn, ...columns]
  }, [columns, enableRowSelection])

  const table = useTable({
    features: dataTableFeatures,
    columns: allColumns,
    data: data ?? (EMPTY_ROWS as readonly TData[]),
    getRowId: (row) => getRowId(row),
    rowCount: meta?.total ?? 0,
    manualPagination: true,
    manualSorting: true,
    enableRowSelection,
    state: { sorting, pagination, columnVisibility, rowSelection },
    onSortingChange: (updater) => {
      const [first] = functionalUpdate(updater, sorting)
      onStateChange({
        sort: first?.id as TSort | undefined,
        order: first ? (first.desc ? "desc" : "asc") : undefined,
        page: 1,
      })
    },
    onPaginationChange: (updater) => {
      const next = functionalUpdate(updater, pagination)
      onStateChange({ page: next.pageIndex + 1, pageSize: next.pageSize })
    },
    onColumnVisibilityChange: (updater) => {
      const next = functionalUpdate(updater, columnVisibility)
      setHiddenColumns(
        tableId,
        Object.entries(next)
          .filter(([, visible]) => !visible)
          .map(([id]) => id)
      )
    },
    onRowSelectionChange: setRowSelection,
  })

  const rows = table.getRowModel().rows
  const visibleColumns = table.getVisibleLeafColumns()
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const clearSelection = () => {
    setRowSelection({})
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual, React Compiler kullanılmıyor
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => virtualized?.estimateRowHeight ?? 44,
    overscan: 8,
    enabled: Boolean(virtualized),
  })
  const virtualItems = virtualized ? virtualizer.getVirtualItems() : null
  const paddingTop = virtualItems?.[0]?.start ?? 0
  const paddingBottom = virtualItems?.length
    ? virtualizer.getTotalSize() -
      (virtualItems[virtualItems.length - 1]?.end ?? 0)
    : 0
  const renderedRows = virtualItems
    ? virtualItems.flatMap((item) => {
        const row = rows[item.index]
        return row ? [row] : []
      })
    : rows

  const exportCsv = () => {
    // Yalnızca veri kolonları (seçim/işlem gibi görüntü kolonları hariç)
    const exportable = visibleColumns.filter(
      (column) =>
        column.columnDef.meta?.exportValue !== undefined ||
        column.accessorFn !== undefined
    )
    const header = exportable.map(
      (column) => column.columnDef.meta?.label ?? column.id
    )
    const body = rows.map((row) =>
      exportable.map((column) => {
        const exportValue = column.columnDef.meta?.exportValue
        if (exportValue) return exportValue(row.original)
        const value = row.getValue<unknown>(column.id)
        return typeof value === "string" || typeof value === "number"
          ? value
          : ""
      })
    )
    downloadBlob(
      csvBlob(toCsv([header, ...body])),
      `${tableId}-${toIsoDate(new Date())}.csv`
    )
  }

  const colSpan = visibleColumns.length
  const showSkeleton = isLoading && !data
  const showError = Boolean(error) && !data

  let body: ReactNode
  if (showSkeleton) {
    body = Array.from({ length: Math.min(state.pageSize, 8) }, (_, index) => (
      <TableRow key={`skeleton-${index}`}>
        {visibleColumns.map((column) => (
          <TableCell key={column.id}>
            <Skeleton className="h-4 w-full max-w-40" />
          </TableCell>
        ))}
      </TableRow>
    ))
  } else if (showError) {
    body = (
      <TableRow>
        <TableCell colSpan={colSpan} className="p-0">
          <ErrorState error={error} onRetry={onRetry} />
        </TableCell>
      </TableRow>
    )
  } else if (rows.length === 0) {
    body = (
      <TableRow>
        <TableCell colSpan={colSpan} className="p-0">
          {emptyState ?? (
            <EmptyState
              icon={SearchXIcon}
              title="Kayıt bulunamadı"
              description="Arama veya filtre kriterlerini değiştirmeyi deneyin."
            />
          )}
        </TableCell>
      </TableRow>
    )
  } else {
    body = (
      <>
        {paddingTop > 0 ? (
          <tr aria-hidden>
            <td colSpan={colSpan} style={{ height: paddingTop }} />
          </tr>
        ) : null}
        {renderedRows.map((row) => (
          <TableRow
            key={row.id}
            data-state={row.getIsSelected() ? "selected" : undefined}
          >
            {row.getVisibleCells().map((cell) => {
              const cellMeta = cell.column.columnDef.meta
              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    ALIGN_CLASS[cellMeta?.align ?? "left"],
                    cellMeta?.cellClassName
                  )}
                >
                  <table.FlexRender cell={cell} />
                </TableCell>
              )
            })}
          </TableRow>
        ))}
        {paddingBottom > 0 ? (
          <tr aria-hidden>
            <td colSpan={colSpan} style={{ height: paddingBottom }} />
          </tr>
        ) : null}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {toolbar}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && renderBulkActions
            ? renderBulkActions({ selectedIds, clearSelection })
            : null}
          {enableCsvExport ? (
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={rows.length === 0}
            >
              <DownloadIcon data-icon="inline-start" />
              CSV
            </Button>
          ) : null}
          <DataTableViewOptions columns={table.getAllLeafColumns()} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border bg-card">
        {isFetching && !showSkeleton ? (
          <div
            className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary"
            role="progressbar"
            aria-label="Veriler yenileniyor"
          />
        ) : null}
        <div
          ref={scrollRef}
          className={cn(virtualized && "overflow-auto")}
          style={virtualized ? { height: virtualized.height } : undefined}
        >
          <Table aria-busy={isLoading || isFetching}>
            <caption className="sr-only">{caption}</caption>
            <TableHeader
              className={cn(virtualized && "sticky top-0 z-[1] bg-card")}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const headerMeta = header.column.columnDef.meta
                    const sorted = header.column.getIsSorted()
                    return (
                      <TableHead
                        key={header.id}
                        aria-sort={
                          header.column.getCanSort()
                            ? sorted === "asc"
                              ? "ascending"
                              : sorted === "desc"
                                ? "descending"
                                : "none"
                            : undefined
                        }
                        className={cn(
                          ALIGN_CLASS[headerMeta?.align ?? "left"],
                          headerMeta?.headerClassName
                        )}
                      >
                        {header.isPlaceholder ? null : (
                          <table.FlexRender header={header} />
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>{body}</TableBody>
          </Table>
        </div>
      </div>

      {meta && meta.total > 0 ? (
        <DataTablePagination
          page={state.page}
          pageSize={state.pageSize}
          total={meta.total}
          selectedCount={selectedIds.length}
          onPageChange={(change) => {
            onStateChange((previous) => ({
              page:
                change === "first"
                  ? 1
                  : change === "last"
                    ? Math.max(1, Math.ceil(meta.total / previous.pageSize))
                    : Math.max(1, previous.page + change),
            }))
          }}
          onPageSizeChange={(pageSize) => {
            onStateChange({ pageSize, page: 1 })
          }}
        />
      ) : null}
    </div>
  )
}
