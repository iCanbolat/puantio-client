import { useDroppable } from "@dnd-kit/core"
import { AlertTriangleIcon, BanIcon, PlaneIcon } from "lucide-react"

import type { RosterMember, ShiftTemplate } from "@/entities/shift"
import { formatDate } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { isoWeekday } from "@/shared/lib/work-time"
import { Checkbox } from "@/shared/ui/checkbox"

import { cellShiftId, type BoardCell } from "../domain/board"
import type { RuleViolation } from "../domain/rules"
import { dayLabel } from "./day-label"
import { SHIFT_COLOR_CLASSES } from "./shift-colors"

function GridCell({
  cell,
  member,
  template,
  violations,
  compact,
  readOnly,
  onOpen,
}: {
  cell: BoardCell
  member: RosterMember
  template: ShiftTemplate | undefined
  violations: readonly RuleViolation[]
  compact: boolean
  readOnly: boolean
  onOpen: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${cell.personnelId}|${cell.date}`,
    disabled: readOnly,
  })
  const blocking = violations.some(
    (violation) => violation.severity === "block"
  )
  const warning = !blocking && violations.length > 0
  const parts = [
    `${member.name}, ${formatDate(cell.date)}`,
    cell.code ? `${template?.name ?? cell.code} (${cell.code})` : "vardiya yok",
    cell.leave
      ? `${cell.leave.typeLabel}${cell.leave.status === "pending" ? " (onay bekliyor)" : " – İzinli"}`
      : null,
    cell.holiday ? cell.holiday.name : null,
    cell.elsewhere ? `başka lokasyonda: ${cell.elsewhere.locationName}` : null,
    cell.draft ? "kaydedilmedi" : null,
    ...violations.map((violation) => violation.message),
  ].filter(Boolean)

  return (
    <td
      ref={setNodeRef}
      className={cn(
        "border-b border-l p-0.5 align-top",
        isoWeekday(cell.date) === 7 && "bg-muted/40",
        cell.holiday && "bg-rose-500/5",
        isOver && "bg-primary/10"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={readOnly}
        aria-label={parts.join(" · ")}
        title={parts.join("\n")}
        data-cell={`${cell.personnelId}|${cell.date}`}
        data-violation={blocking ? "block" : warning ? "warn" : undefined}
        className={cn(
          "relative flex w-full flex-col items-center justify-center gap-0.5 rounded-md text-xs ring-1 ring-transparent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default",
          compact ? "h-9 min-w-9" : "h-12 min-w-16",
          cell.code && template
            ? SHIFT_COLOR_CLASSES[template.color]
            : "hover:bg-muted",
          cell.draft &&
            "outline-2 outline-offset-[-2px] outline-primary/60 outline-dashed",
          blocking && "ring-2 ring-destructive",
          warning && "ring-2 ring-amber-500"
        )}
      >
        {cell.leave?.status === "approved" && !cell.code ? (
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
            <PlaneIcon className="size-3" aria-hidden />
            {compact ? "İz" : "İzinli"}
          </span>
        ) : (
          <span className="font-mono font-semibold">{cell.code ?? ""}</span>
        )}
        {cell.elsewhere && !cell.code ? (
          <span className="max-w-16 truncate text-[10px] text-muted-foreground">
            {cell.elsewhere.code}*
          </span>
        ) : null}
        {blocking ? (
          <BanIcon
            className="absolute top-0.5 right-0.5 size-3 text-destructive"
            aria-hidden
          />
        ) : warning ? (
          <AlertTriangleIcon
            className="absolute top-0.5 right-0.5 size-3 text-amber-600"
            aria-hidden
          />
        ) : null}
        {cell.leave?.status === "pending" ? (
          <span
            className="absolute bottom-0.5 left-0.5 size-1.5 rounded-full bg-amber-500"
            aria-hidden
          />
        ) : null}
      </button>
    </td>
  )
}

export function ScheduleGrid({
  roster,
  days,
  cells,
  templates,
  violationsByShift,
  selectedRows,
  onToggleRow,
  onOpenCell,
  readOnly,
  targetHeadcount,
  caption,
}: {
  roster: readonly RosterMember[]
  days: readonly string[]
  cells: ReadonlyMap<string, BoardCell>
  templates: ReadonlyMap<string, ShiftTemplate>
  violationsByShift: ReadonlyMap<string, RuleViolation[]>
  selectedRows: ReadonlySet<string>
  onToggleRow: (personnelId: string) => void
  onOpenCell: (cell: BoardCell) => void
  readOnly: boolean
  targetHeadcount: number
  caption: string
}) {
  const compact = days.length > 7
  const planned = days.map(
    (date) =>
      roster.filter((member) => cells.get(`${member.id}|${date}`)?.code).length
  )
  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-muted/50">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-52 bg-muted/50 px-2 py-2 text-left text-xs font-medium"
            >
              Personel
            </th>
            {days.map((date) => (
              <th
                key={date}
                scope="col"
                className={cn(
                  "border-l px-1 py-2 text-center text-xs font-medium whitespace-nowrap",
                  isoWeekday(date) === 7 && "text-muted-foreground"
                )}
              >
                {compact ? date.slice(8) : dayLabel(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roster.map((member) => (
            <tr key={member.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b bg-background px-2 py-1 text-left font-normal"
              >
                <span className="flex items-center gap-2">
                  {readOnly ? null : (
                    <Checkbox
                      checked={selectedRows.has(member.id)}
                      onCheckedChange={() => {
                        onToggleRow(member.id)
                      }}
                      aria-label={`${member.name} satırını seç`}
                    />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {member.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {member.employeeNumber}
                      {member.isFloater ? " · Yedek" : ""}
                    </span>
                  </span>
                </span>
              </th>
              {days.map((date) => {
                const cell = cells.get(`${member.id}|${date}`)
                if (!cell)
                  return <td key={date} className="border-b border-l" />
                return (
                  <GridCell
                    key={date}
                    cell={cell}
                    member={member}
                    template={
                      cell.templateId
                        ? templates.get(cell.templateId)
                        : undefined
                    }
                    violations={
                      violationsByShift.get(cellShiftId(member.id, date)) ?? []
                    }
                    compact={compact}
                    readOnly={readOnly}
                    onOpen={() => {
                      onOpenCell(cell)
                    }}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/30">
            <th
              scope="row"
              className="sticky left-0 z-10 bg-muted/30 px-2 py-2 text-left text-xs font-medium"
            >
              Planlanan / hedef kadro
            </th>
            {planned.map((count, index) => (
              <td
                key={days[index]}
                className={cn(
                  "border-l px-1 py-2 text-center text-xs tabular-nums",
                  count < targetHeadcount
                    ? "font-semibold text-destructive"
                    : "text-muted-foreground"
                )}
                aria-label={`${days[index] ?? ""}: ${count} / ${targetHeadcount}`}
              >
                {count}/{targetHeadcount}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
