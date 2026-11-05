import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { getErrorMessage } from "@/shared/api/errors"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { ErrorState } from "@/shared/components/error-state"
import { SimpleSelect } from "@/shared/components/simple-select"
import { formatNumber } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
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
import { Skeleton } from "@/shared/ui/skeleton"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import {
  addAlarmNote,
  assignBackup,
  attendanceKeys,
  attendanceQueries,
  closeAlarm,
} from "../api/attendance-api"
import {
  CLOSE_REASONS,
  CLOSE_REASON_LABELS,
  alarmNoteInputSchema,
  closeAlarmInputSchema,
  type Alarm,
  type CloseAlarmInput,
  type CloseReason,
} from "../model/attendance"

export type AlarmAction = "backup" | "note" | "close"

export function AlarmActionDialog({
  alarm,
  action,
  onClose,
}: {
  alarm: Alarm | null
  action: AlarmAction
  onClose: () => void
}) {
  return (
    <Dialog
      open={alarm !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {alarm ? (
          action === "backup" ? (
            <BackupForm alarm={alarm} onDone={onClose} />
          ) : action === "note" ? (
            <NoteForm alarm={alarm} onDone={onClose} />
          ) : (
            <CloseForm alarm={alarm} onDone={onClose} />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function BackupForm({ alarm, onDone }: { alarm: Alarm; onDone: () => void }) {
  const query = useQuery(attendanceQueries.candidates(alarm.id))
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (personnelId: string) => assignBackup(alarm.id, personnelId),
    meta: {
      silent: true,
      successMessage: "Yedek personel atandı",
      invalidates: [attendanceKeys.all],
    },
  })
  const submit = async () => {
    if (!selected) {
      setError("Yedek personel seçin")
      return
    }
    try {
      await mutation.mutateAsync(selected)
      onDone()
    } catch (caught) {
      setError(getErrorMessage(caught))
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Yedek ata</DialogTitle>
        <DialogDescription>
          {alarm.personnelName} yerine {alarm.locationName}. Öneriler yedek
          havuzu ve boştaki personelden, lokasyona uzaklığa göre sıralıdır.
        </DialogDescription>
      </DialogHeader>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : query.data.items.length === 0 ? (
        <Alert>
          <AlertDescription>
            Uygun yedek bulunamadı. Bölge sorumlusuyla iletişime geçin.
          </AlertDescription>
        </Alert>
      ) : (
        <ol
          className="flex max-h-80 flex-col gap-1.5 overflow-y-auto"
          aria-label="Yedek önerileri"
        >
          {query.data.items.map((candidate, index) => (
            <li key={candidate.personnelId}>
              <button
                type="button"
                aria-pressed={selected === candidate.personnelId}
                onClick={() => {
                  setSelected(candidate.personnelId)
                  setError(null)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  selected === candidate.personnelId &&
                    "border-primary bg-primary/5 ring-1 ring-primary"
                )}
              >
                <span className="w-5 text-xs text-muted-foreground tabular-nums">
                  {index + 1}.
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{candidate.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {candidate.isFloater ? "Yedek havuzu · " : ""}
                    {candidate.currentLocationName ?? "Konum bilinmiyor"}
                  </span>
                </span>
                <span
                  className="text-xs tabular-nums"
                  data-testid="candidate-distance"
                >
                  {formatNumber(candidate.distanceKm, {
                    maximumFractionDigits: 1,
                  })}{" "}
                  km
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button onClick={() => void submit()} disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Yedeği ata
        </Button>
      </DialogFooter>
    </>
  )
}

function NoteForm({ alarm, onDone }: { alarm: Alarm; onDone: () => void }) {
  const form = useForm<{ text: string }>({
    resolver: zodResolver(alarmNoteInputSchema),
    defaultValues: { text: "" },
  })
  const mutation = useMutation({
    mutationFn: (text: string) => addAlarmNote(alarm.id, text),
    meta: { successMessage: "Not eklendi", invalidates: [attendanceKeys.all] },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    await mutation.mutateAsync(values.text)
    onDone()
  })
  const error = form.formState.errors.text
  return (
    <>
      <DialogHeader>
        <DialogTitle>Not ekle</DialogTitle>
        <DialogDescription>
          {alarm.personnelName} · {alarm.locationName}
        </DialogDescription>
      </DialogHeader>
      <form
        id="alarm-note"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="alarm-note-text">Not</FieldLabel>
          <Textarea
            id="alarm-note-text"
            rows={3}
            aria-invalid={Boolean(error)}
            {...form.register("text")}
          />
          <FieldError errors={[error]} />
        </Field>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button
          type="submit"
          form="alarm-note"
          disabled={form.formState.isSubmitting}
        >
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}

function CloseForm({ alarm, onDone }: { alarm: Alarm; onDone: () => void }) {
  const form = useForm<CloseAlarmInput>({
    resolver: zodResolver(closeAlarmInputSchema),
    defaultValues: { reason: "", note: "" },
  })
  const mutation = useMutation({
    mutationFn: (values: { reason: CloseReason; note: string }) =>
      closeAlarm(alarm.id, {
        reason: values.reason,
        ...(values.note ? { note: values.note } : {}),
      }),
    meta: {
      successMessage: "Alarm kapatıldı",
      invalidates: [attendanceKeys.all],
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({
        reason: values.reason as CloseReason,
        note: values.note,
      })
      onDone()
    } catch (error) {
      applyApiErrorToForm(error, form.setError, ["reason", "note"])
    }
  })
  const { errors, isSubmitting } = form.formState
  return (
    <>
      <DialogHeader>
        <DialogTitle>Alarmı kapat</DialogTitle>
        <DialogDescription>
          {alarm.personnelName} · {alarm.locationName}. Kapatma gerekçesi
          denetim kaydına yazılır.
        </DialogDescription>
      </DialogHeader>
      <form
        id="alarm-close"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          <Field data-invalid={Boolean(errors.reason) || undefined}>
            <FieldLabel htmlFor="alarm-close-reason">Gerekçe</FieldLabel>
            <Controller
              control={form.control}
              name="reason"
              render={({ field }) => (
                <SimpleSelect
                  id="alarm-close-reason"
                  value={field.value === "" ? null : field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errors.reason)}
                  placeholder="Gerekçe seçin"
                  options={CLOSE_REASONS.map((value) => ({
                    value,
                    label: CLOSE_REASON_LABELS[value],
                  }))}
                />
              )}
            />
            <FieldError errors={[errors.reason]} />
          </Field>
          <Field data-invalid={Boolean(errors.note) || undefined}>
            <FieldLabel htmlFor="alarm-close-note">Açıklama</FieldLabel>
            <Textarea
              id="alarm-close-note"
              rows={3}
              aria-invalid={Boolean(errors.note)}
              {...form.register("note")}
            />
            <FieldError errors={[errors.note]} />
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="alarm-close" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Alarmı kapat
        </Button>
      </DialogFooter>
    </>
  )
}
