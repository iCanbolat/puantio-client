import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { getErrorMessage } from "@/shared/api/errors"
import { SimpleSelect } from "@/shared/components/simple-select"
import { formatDateLong } from "@/shared/lib/format"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"

import { timesheetKeys, updateTimesheetCell } from "../api/timesheet-api"
import {
  CELL_CODE_LABELS,
  EDITABLE_CELL_CODES,
  type CellCode,
} from "../model/cell-code"
import type { TimesheetCell, TimesheetRow } from "../model/timesheet"

export function CellEditDialog({
  periodId,
  target,
  tracksChanges,
  onClose,
}: {
  periodId: string
  target: { row: TimesheetRow; cell: TimesheetCell } | null
  tracksChanges: boolean
  onClose: () => void
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        {target ? (
          <CellForm
            key={`${target.row.personnelId}|${target.cell.date}`}
            periodId={periodId}
            target={target}
            tracksChanges={tracksChanges}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CellForm({
  periodId,
  target,
  tracksChanges,
  onDone,
}: {
  periodId: string
  target: { row: TimesheetRow; cell: TimesheetCell }
  tracksChanges: boolean
  onDone: () => void
}) {
  const initial =
    target.cell.code && target.cell.code !== "?" && target.cell.code !== "-"
      ? target.cell.code
      : null
  const [code, setCode] = useState<CellCode | null>(initial)
  const [overtime, setOvertime] = useState(
    String(target.cell.overtimeHours || "")
  )
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () =>
      updateTimesheetCell(periodId, {
        personnelId: target.row.personnelId,
        date: target.cell.date,
        code: code ?? "N",
        overtimeHours:
          code === "FM" ? Number(overtime.replace(",", ".")) || 0 : 0,
      }),
    meta: {
      silent: true,
      successMessage: "Puantaj hücresi güncellendi",
      invalidates: [timesheetKeys.all],
    },
  })
  const save = async () => {
    if (!code) {
      setError("Kod seçin")
      return
    }
    if (code === "FM" && !(Number(overtime.replace(",", ".")) > 0)) {
      setError("Fazla mesai saatini girin (ör. 2,5)")
      return
    }
    try {
      await mutation.mutateAsync()
      onDone()
    } catch (caught) {
      setError(getErrorMessage(caught))
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Puantaj kodu</DialogTitle>
        <DialogDescription>
          {target.row.name} · {formatDateLong(target.cell.date)}
        </DialogDescription>
      </DialogHeader>
      {tracksChanges ? (
        <Alert>
          <AlertDescription>
            Dönem onaylandı; bu değişiklik fark listesinde görünecek.
          </AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor="cell-code">Kod</FieldLabel>
        <SimpleSelect
          id="cell-code"
          value={code}
          onChange={(value) => {
            setCode(value)
            setError(null)
          }}
          options={EDITABLE_CELL_CODES.map((value) => ({
            value,
            label: `${value} · ${CELL_CODE_LABELS[value]}`,
          }))}
        />
      </Field>
      {code === "FM" ? (
        <Field>
          <FieldLabel htmlFor="cell-overtime">Fazla mesai (saat)</FieldLabel>
          <Input
            id="cell-overtime"
            inputMode="decimal"
            value={overtime}
            onChange={(event) => {
              setOvertime(event.target.value)
            }}
          />
          <FieldDescription>
            Yarım saat hassasiyetinde: 1,5 · 2 · 7,5
          </FieldDescription>
        </Field>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button onClick={() => void save()} disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
