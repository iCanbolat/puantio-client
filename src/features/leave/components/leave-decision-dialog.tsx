import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import {
  LEAVE_TYPE_LABELS,
  decideLeave,
  leaveKeys,
  type Leave,
} from "@/entities/leave"
import { shiftKeys } from "@/entities/shift"
import { getErrorMessage } from "@/shared/api/errors"
import { formatDate } from "@/shared/lib/format"
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
import { Field, FieldError, FieldLabel } from "@/shared/ui/field"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

export function LeaveDecisionDialog({
  leave,
  decision,
  onClose,
}: {
  leave: Leave | null
  decision: "approve" | "reject"
  onClose: () => void
}) {
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (input: { id: string; note: string }) =>
      decideLeave(input.id, {
        decision,
        ...(input.note ? { note: input.note } : {}),
      }),
    meta: {
      silent: true,
      invalidates: [leaveKeys.all, shiftKeys.all],
    },
  })
  const close = () => {
    setNote("")
    setError(null)
    onClose()
  }
  const submit = async () => {
    if (!leave) return
    if (decision === "reject" && note.trim().length < 3) {
      setError("Ret gerekçesini yazın.")
      return
    }
    try {
      const result = await mutation.mutateAsync({
        id: leave.id,
        note: note.trim(),
      })
      toast.success(
        decision === "approve"
          ? `İzin onaylandı${result.removedShifts > 0 ? `; ${result.removedShifts} vardiya plandan kaldırıldı` : ""}`
          : "İzin talebi reddedildi"
      )
      close()
    } catch (caught) {
      setError(getErrorMessage(caught))
    }
  }

  return (
    <Dialog
      open={leave !== null}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === "approve" ? "İzni onayla" : "İzni reddet"}
          </DialogTitle>
          <DialogDescription>
            {leave
              ? `${leave.personnelName} · ${LEAVE_TYPE_LABELS[leave.type]} · ${formatDate(leave.startDate)} – ${formatDate(leave.endDate)} (${leave.days} gün)`
              : null}
          </DialogDescription>
        </DialogHeader>
        {decision === "approve" ? (
          <Alert>
            <AlertDescription>
              Onaylandığında bu tarihlerdeki vardiyalar plandan kaldırılır ve
              günler panoda "İzinli" görünür.
            </AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="leave-decision-note">
            {decision === "reject" ? "Ret gerekçesi" : "Not (isteğe bağlı)"}
          </FieldLabel>
          <Textarea
            id="leave-decision-note"
            rows={3}
            value={note}
            aria-invalid={Boolean(error) || undefined}
            onChange={(event) => {
              setNote(event.target.value)
            }}
          />
          <FieldError>{error}</FieldError>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Vazgeç
          </Button>
          <Button
            variant={decision === "reject" ? "destructive" : "default"}
            onClick={() => void submit()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {decision === "approve" ? "Onayla" : "Reddet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
