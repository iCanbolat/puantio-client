import { Trash2Icon } from "lucide-react"

import {
  templateTimeLabel,
  type RosterMember,
  type ShiftTemplate,
} from "@/entities/shift"
import { formatDateLong } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

import type { BoardCell } from "../domain/board"
import type { RuleViolation } from "../domain/rules"
import { SHIFT_COLOR_CLASSES } from "./shift-colors"

/** Hücre düzenleyici: sürükle-bırakın klavye/dokunmatik alternatifi */
export function CellEditorDialog({
  cell,
  member,
  templates,
  violations,
  onSelect,
  onClose,
}: {
  cell: BoardCell | null
  member: RosterMember | undefined
  templates: readonly ShiftTemplate[]
  violations: readonly RuleViolation[]
  onSelect: (templateId: string | null) => void
  onClose: () => void
}) {
  const options = templates.filter(
    (template) => template.isActive && template.kind !== "rotation"
  )
  return (
    <Dialog
      open={cell !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vardiya seç</DialogTitle>
          <DialogDescription>
            {member?.name} · {cell ? formatDateLong(cell.date) : ""}
          </DialogDescription>
        </DialogHeader>
        {cell?.leave ? (
          <Alert
            variant={
              cell.leave.status === "approved" ? "destructive" : "default"
            }
          >
            <AlertDescription>
              {cell.leave.typeLabel}
              {cell.leave.status === "approved"
                ? ": onaylı izin günü, vardiya atanamaz."
                : ": onay bekleyen talep var."}
            </AlertDescription>
          </Alert>
        ) : null}
        {cell?.elsewhere ? (
          <Alert>
            <AlertDescription>
              Bu gün {cell.elsewhere.locationName} lokasyonunda{" "}
              {cell.elsewhere.code} vardiyası var.
            </AlertDescription>
          </Alert>
        ) : null}
        {violations.length > 0 ? (
          <ul
            className="flex flex-col gap-1 text-sm"
            aria-label="Kural uyarıları"
          >
            {violations.map((violation, index) => (
              <li
                key={`${violation.code}-${index}`}
                className={cn(
                  "rounded-md px-2 py-1",
                  violation.severity === "block"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                )}
              >
                {violation.message}
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="grid gap-1.5" aria-label="Şablonlar">
          {options.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(template.id)
                }}
                aria-pressed={cell?.templateId === template.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ring-1 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  SHIFT_COLOR_CLASSES[template.color],
                  cell?.templateId === template.id && "ring-2 ring-primary"
                )}
              >
                <span className="w-10 font-mono font-semibold">
                  {template.code}
                </span>
                <span className="flex-1">{template.name}</span>
                <span className="text-xs tabular-nums opacity-80">
                  {templateTimeLabel(template)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          onClick={() => {
            onSelect(null)
          }}
          disabled={!cell?.templateId}
        >
          <Trash2Icon data-icon="inline-start" />
          Vardiyayı kaldır
        </Button>
      </DialogContent>
    </Dialog>
  )
}
