import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useForm, useWatch } from "react-hook-form"

import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { formatDate, formatTime } from "@/shared/lib/format"
import {
  addDaysIso,
  istanbulDateTime,
  minutesOfDay,
} from "@/shared/lib/work-time"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import { attendanceKeys, correctAttendance } from "../api/attendance-api"
import {
  correctionInputSchema,
  type AttendanceRecord,
  type CorrectionInput,
} from "../model/attendance"

const FIELDS = ["checkInTime", "checkOutTime", "reason"] as const

/** Süpervizör manuel düzeltmesi: gerekçe zorunlu, önce/sonra farkı denetim kaydına yazılır */
export function CorrectionDialog({
  record,
  onClose,
}: {
  record: AttendanceRecord | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={record !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {record ? (
          <CorrectionForm
            key={record.shiftId}
            record={record}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CorrectionForm({
  record,
  onDone,
}: {
  record: AttendanceRecord
  onDone: () => void
}) {
  const form = useForm<CorrectionInput>({
    resolver: zodResolver(correctionInputSchema),
    defaultValues: {
      checkInTime: formatTime(record.checkIn?.deviceTime ?? record.startsAt),
      checkOutTime: record.checkOut
        ? formatTime(record.checkOut.deviceTime)
        : "",
      reason: "",
    },
  })
  const values = useWatch({ control: form.control })
  const mutation = useMutation({
    mutationFn: (input: CorrectionInput) => {
      const checkIn = istanbulDateTime(record.date, input.checkInTime)
      const outDate =
        input.checkOutTime &&
        minutesOfDay(input.checkOutTime) <= minutesOfDay(input.checkInTime)
          ? addDaysIso(record.date, 1)
          : record.date
      return correctAttendance(record.shiftId, {
        checkInAt: checkIn.toISOString(),
        checkOutAt: input.checkOutTime
          ? istanbulDateTime(outDate, input.checkOutTime).toISOString()
          : null,
        reason: input.reason,
      })
    },
    meta: {
      successMessage: "Yoklama düzeltildi; denetim kaydına yazıldı",
      invalidates: [attendanceKeys.all],
    },
  })
  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await mutation.mutateAsync(input)
      onDone()
    } catch (error) {
      applyApiErrorToForm(error, form.setError, FIELDS)
    }
  })
  const { errors, isSubmitting } = form.formState
  const before = `${record.checkIn ? formatTime(record.checkIn.deviceTime) : "yok"} – ${record.checkOut ? formatTime(record.checkOut.deviceTime) : "yok"}`
  const after = `${values.checkInTime || "?"} – ${values.checkOutTime || "yok"}`

  return (
    <>
      <DialogHeader>
        <DialogTitle>Yoklamayı düzelt</DialogTitle>
        <DialogDescription>
          {record.personnelName} · {formatDate(record.date)} · vardiya{" "}
          {formatTime(record.startsAt)}–{formatTime(record.endsAt)}
        </DialogDescription>
      </DialogHeader>
      <form
        id="attendance-correction"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          {errors.root?.server?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={Boolean(errors.checkInTime) || undefined}>
              <FieldLabel htmlFor="corr-in">Giriş saati</FieldLabel>
              <Input
                id="corr-in"
                type="time"
                aria-invalid={Boolean(errors.checkInTime)}
                {...form.register("checkInTime")}
              />
              <FieldError errors={[errors.checkInTime]} />
            </Field>
            <Field data-invalid={Boolean(errors.checkOutTime) || undefined}>
              <FieldLabel htmlFor="corr-out">Çıkış saati</FieldLabel>
              <Input
                id="corr-out"
                type="time"
                aria-invalid={Boolean(errors.checkOutTime)}
                {...form.register("checkOutTime")}
              />
              <FieldError errors={[errors.checkOutTime]} />
            </Field>
          </div>
          <dl
            className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/50 p-3 text-sm"
            aria-label="Değişiklik özeti"
          >
            <dt className="text-muted-foreground">Önce</dt>
            <dd className="tabular-nums" data-testid="correction-before">
              {before}
            </dd>
            <dt className="text-muted-foreground">Sonra</dt>
            <dd
              className="font-medium tabular-nums"
              data-testid="correction-after"
            >
              {after}
            </dd>
          </dl>
          <Field data-invalid={Boolean(errors.reason) || undefined}>
            <FieldLabel htmlFor="corr-reason">Gerekçe</FieldLabel>
            <Textarea
              id="corr-reason"
              rows={3}
              aria-invalid={Boolean(errors.reason)}
              {...form.register("reason")}
            />
            <FieldDescription>
              Denetim kaydında önce/sonra ile birlikte saklanır.
            </FieldDescription>
            <FieldError errors={[errors.reason]} />
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button
          type="submit"
          form="attendance-correction"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Düzeltmeyi kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
