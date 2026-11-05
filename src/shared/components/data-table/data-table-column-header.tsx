import type { Column } from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"

import type { DataTableFeatures } from "./types"

/** Sıralanabilir kolon başlığı: artan → azalan → sıralamasız döngüsü. */
export function DataTableColumnHeader<TData extends object, TValue>({
  column,
  title,
  className,
}: {
  column: Column<DataTableFeatures, TData, TValue>
  title: string
  className?: string
}) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>
  }
  const sorted = column.getIsSorted()
  const Icon =
    sorted === "asc"
      ? ArrowUpIcon
      : sorted === "desc"
        ? ArrowDownIcon
        : ArrowUpDownIcon
  const nextLabel =
    sorted === "asc"
      ? "azalan sırala"
      : sorted === "desc"
        ? "sıralamayı kaldır"
        : "artan sırala"

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "-ml-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-left font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        sorted && "text-foreground",
        className
      )}
      aria-label={`${title}: ${nextLabel}`}
    >
      {title}
      <Icon
        className={cn("size-3.5", !sorted && "text-muted-foreground/60")}
        aria-hidden
      />
    </button>
  )
}
