import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { ApiError } from "@/shared/api/errors"
import { AsyncCombobox } from "@/shared/components/async-combobox"
import { FileDropzone } from "@/shared/components/file-dropzone"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import {
  fetchAssignees,
  transitionWorkOrder,
  uploadPhoto,
  workOrderKeys,
} from "../api/work-order-api"
import {
  WORK_ORDER_ACTION_LABELS,
  type WorkOrderAction,
  type WorkOrderSummary,
} from "../model/work-order"

const DESCRIPTIONS: Record<WorkOrderAction, string> = {
  assign:
    "Lokasyondaki personel önce listelenir; yedek havuzundan da seçebilirsiniz.",
  start: "İş emri müdahale aşamasına geçer.",
  complete:
    "Tamamlanma fotoğrafı zorunludur. Doğrulama süpervizör tarafından yapılır.",
  verify: "İş yerinde kontrol edildi ve sorun giderildi.",
  reopen:
    "Sorun giderilmediyse iş emri müdahaleye geri döner. Gerekçe zorunlu.",
  cancel: "İş emri kapatılır ve SLA hesabına girmez. Gerekçe zorunlu.",
}

const PHOTO_MAX = 5 * 1024 * 1024

/**
 * İş emri durum geçişi. Listede ve panoda tek diyalog kullanılır (satır başına diyalog
 * render edilmez); `action` null iken kapalıdır.
 */
export function TransitionDialog({
  order,
  action,
  onClose,
}: {
  order: Pick<
    WorkOrderSummary,
    "id" | "number" | "title" | "assigneeId" | "assigneeName"
  > | null
  action: WorkOrderAction | null
  onClose: () => void
}) {
  const [assignee, setAssignee] = useState<{
    id: string
    label: string
  } | null>(null)
  const [note, setNote] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: async () => {
      if (!order || !action) throw new Error("İş emri seçilmedi")
      const photo =
        action === "complete" && files[0] ? await uploadPhoto(files[0]) : null
      return transitionWorkOrder(order.id, {
        action,
        assigneeId: action === "assign" ? (assignee?.id ?? null) : undefined,
        note: note.trim() || null,
        photoId: photo?.id ?? null,
      })
    },
    meta: {
      successMessage: action
        ? `${WORK_ORDER_ACTION_LABELS[action]}: ${order?.number ?? ""}`
        : undefined,
      invalidates: [workOrderKeys.all],
    },
  })
  const close = () => {
    setAssignee(null)
    setNote("")
    setFiles([])
    setError(null)
    mutation.reset()
    onClose()
  }
  const needsReason = action === "cancel" || action === "reopen"
  const submit = () => {
    if (!action) return
    if (action === "assign" && !assignee) {
      setError("Atanacak personeli seçin")
      return
    }
    if (action === "complete" && files.length === 0) {
      setError("Tamamlanma fotoğrafı zorunlu")
      return
    }
    if (needsReason && note.trim().length < 5) {
      setError("Gerekçe en az 5 karakter olmalı")
      return
    }
    setError(null)
    mutation.mutate(undefined, { onSuccess: close })
  }
  const serverError =
    mutation.error instanceof ApiError ? mutation.error.message : null

  return (
    <Dialog
      open={order !== null && action !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action ? WORK_ORDER_ACTION_LABELS[action] : ""}
          </DialogTitle>
          <DialogDescription>
            {order ? `${order.number} · ${order.title}. ` : ""}
            {action ? DESCRIPTIONS[action] : ""}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}
          {action === "assign" && order ? (
            <Field data-invalid={Boolean(error) || undefined}>
              <FieldLabel>Personel</FieldLabel>
              <AsyncCombobox
                aria-label="Atanacak personel"
                queryKey={workOrderKeys.assignees(order.id)}
                fetchOptions={async (q, signal) =>
                  (await fetchAssignees(order.id, q, signal)).map((item) => ({
                    value: item.id,
                    label: item.name,
                    description: item.atLocation
                      ? `${item.description} · Bu lokasyonda`
                      : item.description,
                  }))
                }
                value={assignee?.id ?? null}
                selectedLabel={
                  assignee?.label ?? order.assigneeName ?? undefined
                }
                onValueChange={(value, option) => {
                  setAssignee(
                    value && option ? { id: value, label: option.label } : null
                  )
                  setError(null)
                }}
                placeholder="Personel ara…"
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          ) : null}
          {action === "complete" ? (
            <Field data-invalid={Boolean(error) || undefined}>
              <FileDropzone
                files={files}
                onFilesChange={(next) => {
                  setFiles(next)
                  setError(null)
                }}
                accept="image/*"
                maxSizeBytes={PHOTO_MAX}
                label="Tamamlanma fotoğrafı"
                description="JPG veya PNG, en fazla 5 MB"
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          ) : null}
          {action && action !== "assign" ? (
            <Field data-invalid={(needsReason && Boolean(error)) || undefined}>
              <FieldLabel htmlFor="work-order-note">
                {needsReason ? "Gerekçe" : "Not (isteğe bağlı)"}
              </FieldLabel>
              <Textarea
                id="work-order-note"
                rows={3}
                value={note}
                maxLength={500}
                aria-invalid={(needsReason && Boolean(error)) || undefined}
                onChange={(event) => {
                  setNote(event.target.value)
                }}
              />
              {needsReason && error ? <FieldError>{error}</FieldError> : null}
            </Field>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Vazgeç
          </Button>
          <Button disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {action ? WORK_ORDER_ACTION_LABELS[action] : "Onayla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
