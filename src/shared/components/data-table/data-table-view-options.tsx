import type { Column } from "@tanstack/react-table"
import { Columns3Icon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

import type { DataTableFeatures } from "./types"

export function DataTableViewOptions<TData extends object>({
  columns,
}: {
  columns: Column<DataTableFeatures, TData>[]
}) {
  const hideable = columns.filter((column) => column.getCanHide())
  if (hideable.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Columns3Icon data-icon="inline-start" />
        Kolonlar
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Görünür kolonlar</DropdownMenuLabel>
          {hideable.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(checked) => {
                column.toggleVisibility(checked)
              }}
            >
              {column.columnDef.meta?.label ?? column.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
