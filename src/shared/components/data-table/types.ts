import {
  columnVisibilityFeature,
  createColumnHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
} from "@tanstack/react-table"
import type { CellData, RowData, TableFeatures } from "@tanstack/table-core"

import type { SortOrder } from "@/shared/types"

declare module "@tanstack/table-core" {
  // Tüm tablolarda ortak kolon meta alanları. Tip parametreleri kütüphanedeki
  // bildirimle birebir aynı olmalı (declaration merging); kullanılmamaları normal.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** Kolon görünürlüğü menüsü ve CSV başlığı için okunabilir ad */
    label?: string
    align?: "left" | "right" | "center"
    headerClassName?: string
    cellClassName?: string
    /** CSV dışa aktarımda kullanılacak değer (varsayılan: hücre değeri) */
    exportValue?: (row: TData) => string | number | null | undefined
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

/** DataTable'ın kullandığı özellik seti. Sıralama ve sayfalama sunucu taraflıdır. */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
})
export type DataTableFeatures = typeof dataTableFeatures

// Kolon dizileri farklı değer tipleri içerir; kütüphanenin kendi `columns()` yardımcısı da `any` kullanır.
export type DataTableColumns<TData extends RowData> = ReadonlyArray<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ColumnDef<DataTableFeatures, TData, any>
>

export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>()
}

/** Tablonun sunucu taraflı durumu. URL ile birebir eşlenir (bkz. `useSearchParamsState`). */
export interface DataTableQueryState<TSort extends string = string> {
  page: number
  pageSize: number
  sort?: TSort | undefined
  order?: SortOrder | undefined
}

export type DataTableStatePatch<TSort extends string = string> =
  | Partial<DataTableQueryState<TSort>>
  | ((
      previous: DataTableQueryState<TSort>
    ) => Partial<DataTableQueryState<TSort>>)
