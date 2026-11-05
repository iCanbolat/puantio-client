import { useVirtualizer } from "@tanstack/react-virtual"
import { useRef } from "react"

import { cn } from "@/shared/lib/utils"
import { isoWeekday } from "@/shared/lib/work-time"

import { CELL_CODE_LABELS, cellTone, type CellTone } from "../model/cell-code"
import type {
  TimesheetCell,
  TimesheetGrid as Grid,
  TimesheetRow,
} from "../model/timesheet"

const NAME_WIDTH = 220
const CELL_WIDTH = 42
const SUMMARY_WIDTH = 64
const ROW_HEIGHT = 36
const SUMMARY_COLUMNS = [
  { key: "workedDays", label: "Çalışılan" },
  { key: "overtimeHours", label: "FM (sa)" },
  { key: "absenceDays", label: "Devamsız" },
] as const

const TONE_CLASSES: Record<CellTone, string> = {
  work: "text-foreground",
  leave: "bg-sky-500/15 text-sky-900 dark:text-sky-200",
  off: "text-muted-foreground",
  absent: "bg-destructive/15 font-semibold text-destructive",
  holiday: "bg-rose-500/10 text-rose-800 dark:text-rose-300",
  missing: "bg-amber-500/25 font-semibold text-amber-900 dark:text-amber-200",
  none: "text-muted-foreground/60",
}

const fmt = (value: number) => value.toLocaleString("tr-TR")

/**
 * Personel × gün puantaj grid'i. Hem satır hem sütun ekseninde sanallaştırılır (6.000
 * personel × 31 gün). Klavye: hücreler buton; düzenleme diyaloğu açar.
 */
export function TimesheetGrid({
  grid,
  editable,
  onEdit,
}: {
  grid: Grid
  editable: boolean
  onEdit: (row: TimesheetRow, cell: TimesheetCell) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = grid.days
  const holidays = new Map(
    grid.holidays.map((holiday) => [holiday.date, holiday])
  )
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual, React Compiler kullanılmıyor
  const rowVirtualizer = useVirtualizer({
    count: grid.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    initialRect: { width: 1200, height: 560 },
  })
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: days.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CELL_WIDTH,
    overscan: 6,
    paddingStart: NAME_WIDTH,
    initialRect: { width: 1600, height: 560 },
  })
  const totalWidth =
    NAME_WIDTH +
    days.length * CELL_WIDTH +
    SUMMARY_COLUMNS.length * SUMMARY_WIDTH
  const columns = columnVirtualizer.getVirtualItems()
  const summaryLeft = NAME_WIDTH + days.length * CELL_WIDTH

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label="Puantaj"
      aria-rowcount={grid.rows.length + 1}
      aria-colcount={days.length + 1 + SUMMARY_COLUMNS.length}
      className="relative h-[560px] overflow-auto rounded-xl border bg-background text-xs"
    >
      <div
        style={{
          width: totalWidth,
          height: rowVirtualizer.getTotalSize() + ROW_HEIGHT,
        }}
        className="relative"
      >
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-20 flex h-9 border-b bg-muted"
          style={{ width: totalWidth }}
        >
          <div
            role="columnheader"
            className="sticky left-0 z-30 flex items-center bg-muted px-2 font-medium"
            style={{ width: NAME_WIDTH }}
          >
            Personel
          </div>
          {columns.map((column) => {
            const date = days[column.index] ?? ""
            const holiday = holidays.get(date)
            return (
              <div
                key={date}
                role="columnheader"
                aria-colindex={column.index + 2}
                title={holiday?.name}
                className={cn(
                  "absolute top-0 flex h-9 flex-col items-center justify-center border-l leading-tight",
                  isoWeekday(date) === 7 && "text-muted-foreground",
                  holiday && "text-rose-700 dark:text-rose-300"
                )}
                style={{ left: column.start, width: CELL_WIDTH }}
              >
                <span className="font-medium tabular-nums">
                  {Number(date.slice(8))}
                </span>
                <span className="text-[10px]">
                  {
                    ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"][
                      isoWeekday(date) - 1
                    ]
                  }
                </span>
              </div>
            )
          })}
          {SUMMARY_COLUMNS.map((column, index) => (
            <div
              key={column.key}
              role="columnheader"
              className="absolute top-0 flex h-9 items-center justify-center border-l bg-muted font-medium"
              style={{
                left: summaryLeft + index * SUMMARY_WIDTH,
                width: SUMMARY_WIDTH,
              }}
            >
              {column.label}
            </div>
          ))}
        </div>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = grid.rows[virtualRow.index]
          if (!row) return null
          const invalid = row.summary.unresolvedDays > 0
          return (
            <div
              key={row.personnelId}
              role="row"
              aria-rowindex={virtualRow.index + 2}
              className="absolute left-0 flex border-b"
              style={{
                top: ROW_HEIGHT + virtualRow.start,
                height: ROW_HEIGHT,
                width: totalWidth,
              }}
            >
              <div
                role="rowheader"
                className={cn(
                  "sticky left-0 z-10 flex flex-col justify-center bg-background px-2",
                  invalid && "bg-amber-50 dark:bg-amber-950/40"
                )}
                style={{ width: NAME_WIDTH }}
              >
                <span className="truncate font-medium">{row.name}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {row.employeeNumber}
                  {row.locationName ? ` · ${row.locationName}` : ""}
                </span>
              </div>
              {columns.map((column) => {
                const cell = row.cells[column.index]
                if (!cell) return null
                const tone = cellTone(cell.code)
                const label = `${row.name}, ${cell.date}: ${cell.code ? CELL_CODE_LABELS[cell.code] : "belirlenmedi"}${cell.overtimeHours > 0 ? `, ${fmt(cell.overtimeHours)} saat fazla mesai` : ""}${cell.overridden ? " (elle düzeltildi)" : ""}`
                return (
                  <div
                    key={cell.date}
                    role="gridcell"
                    aria-colindex={column.index + 2}
                    className="absolute top-0 border-l p-0.5"
                    style={{
                      left: column.start,
                      width: CELL_WIDTH,
                      height: ROW_HEIGHT,
                    }}
                  >
                    <button
                      type="button"
                      disabled={!editable || cell.code === "-"}
                      onClick={() => {
                        onEdit(row, cell)
                      }}
                      aria-label={label}
                      title={label}
                      data-code={cell.code ?? ""}
                      className={cn(
                        "relative flex size-full items-center justify-center rounded font-mono text-[11px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none enabled:hover:ring-1 enabled:hover:ring-primary/50",
                        TONE_CLASSES[tone]
                      )}
                    >
                      {cell.code ?? "·"}
                      {cell.overridden ? (
                        <span
                          className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary"
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  </div>
                )
              })}
              {SUMMARY_COLUMNS.map((column, index) => (
                <div
                  key={column.key}
                  role="gridcell"
                  className={cn(
                    "absolute top-0 flex items-center justify-center border-l tabular-nums",
                    column.key === "absenceDays" &&
                      row.summary.absenceDays > 0 &&
                      "font-semibold text-destructive"
                  )}
                  style={{
                    left: summaryLeft + index * SUMMARY_WIDTH,
                    width: SUMMARY_WIDTH,
                    height: ROW_HEIGHT,
                  }}
                >
                  {fmt(row.summary[column.key])}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
