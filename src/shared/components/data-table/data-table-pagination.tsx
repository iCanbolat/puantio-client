import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { formatNumber } from "@/shared/lib/format"
import { PAGE_SIZE_OPTIONS } from "@/shared/types"
import { Button } from "@/shared/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"

/** Göreli (-1/+1) veya uç sayfa değişimi; hesap güncel URL durumuna göre yapılır. */
export type PageChange = "first" | "last" | -1 | 1

/**
 * Sayfalama çubuğu. Sayfa ve boyut URL durumundan gelir; `total` sunucu yanıtından.
 * (Önceki sayfanın verisi gösterilirken eski `meta.page` ile hesap yapılmaz.)
 */
export function DataTablePagination({
  page,
  pageSize,
  total,
  selectedCount = 0,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  selectedCount?: number
  onPageChange: (change: PageChange) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const canPrevious = page > 1
  const canNext = page < pageCount

  return (
    <div className="flex flex-col-reverse gap-3 px-1 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground" aria-live="polite">
        Toplam{" "}
        <span className="font-medium text-foreground">
          {formatNumber(total)}
        </span>{" "}
        kayıt
        {selectedCount > 0 ? ` · ${formatNumber(selectedCount)} seçili` : null}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground" id="page-size-label">
            Sayfa başına
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              onPageSizeChange(Number(value))
            }}
          >
            <SelectTrigger
              size="sm"
              className="w-20"
              aria-labelledby="page-size-label"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular-nums">
          Sayfa {formatNumber(Math.min(page, pageCount))} /{" "}
          {formatNumber(pageCount)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="İlk sayfa"
            disabled={!canPrevious}
            onClick={() => {
              onPageChange("first")
            }}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Önceki sayfa"
            disabled={!canPrevious}
            onClick={() => {
              onPageChange(-1)
            }}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Sonraki sayfa"
            disabled={!canNext}
            onClick={() => {
              onPageChange(1)
            }}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Son sayfa"
            disabled={!canNext}
            onClick={() => {
              onPageChange("last")
            }}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}
