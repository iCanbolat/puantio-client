import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { InfoIcon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"

import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  createLeave,
  leaveInputSchema,
  leaveKeys,
  type LeaveInput,
  type LeavePayload,
} from "@/entities/leave"
import { PersonnelCombobox } from "@/entities/personnel"
import { shiftKeys } from "@/entities/shift"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { SimpleSelect } from "@/shared/components/simple-select"
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

const FIELDS = ["personnelId", "type", "startDate", "endDate", "note"] as const

export function LeaveRequestDialog({
  open,
  onClose,
  personnel,
}: {
  open: boolean
  onClose: () => void
  /** Personel kartından açıldığında sabit personel */
  personnel?: { id: string; name: string }
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {open ? (
          <LeaveRequestForm onDone={onClose} personnel={personnel} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function LeaveRequestForm({
  onDone,
  personnel,
}: {
  onDone: () => void
  personnel?: { id: string; name: string } | undefined
}) {
  const form = useForm<LeaveInput, unknown, LeavePayload>({
    resolver: zodResolver(leaveInputSchema),
    defaultValues: {
      personnelId: personnel?.id ?? "",
      type: "annual",
      startDate: "",
      endDate: "",
      note: "",
    },
  })
  const type = useWatch({ control: form.control, name: "type" })
  const mutation = useMutation({
    mutationFn: createLeave,
    meta: {
      successMessage: "İzin talebi oluşturuldu; onay bekliyor",
      invalidates: [leaveKeys.all, shiftKeys.all],
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values)
      onDone()
    } catch (error) {
      applyApiErrorToForm(error, form.setError, FIELDS)
    }
  })
  const { errors, isSubmitting } = form.formState

  return (
    <>
      <DialogHeader>
        <DialogTitle>Yeni izin / rapor kaydı</DialogTitle>
        <DialogDescription>
          Talep bölge sorumlusunun onayına düşer. Onaylanan izin vardiya
          planında ve puantajda otomatik işaretlenir.
        </DialogDescription>
      </DialogHeader>
      <form
        id="leave-request"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          {errors.root?.server?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={Boolean(errors.personnelId) || undefined}>
            <FieldLabel htmlFor="leave-personnel">Personel</FieldLabel>
            {personnel ? (
              <Input id="leave-personnel" value={personnel.name} readOnly />
            ) : (
              <Controller
                control={form.control}
                name="personnelId"
                render={({ field }) => (
                  <PersonnelCombobox
                    aria-label="Personel"
                    value={field.value || null}
                    onValueChange={(value) => {
                      field.onChange(value ?? "")
                    }}
                  />
                )}
              />
            )}
            <FieldError errors={[errors.personnelId]} />
          </Field>
          <Field data-invalid={Boolean(errors.type) || undefined}>
            <FieldLabel htmlFor="leave-type">Tür</FieldLabel>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <SimpleSelect
                  id="leave-type"
                  value={field.value}
                  onChange={field.onChange}
                  options={LEAVE_TYPES.map((value) => ({
                    value,
                    label: LEAVE_TYPE_LABELS[value],
                  }))}
                />
              )}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.startDate) || undefined}>
              <FieldLabel htmlFor="leave-start">Başlangıç</FieldLabel>
              <Input
                id="leave-start"
                type="date"
                aria-invalid={Boolean(errors.startDate)}
                {...form.register("startDate")}
              />
              <FieldError errors={[errors.startDate]} />
            </Field>
            <Field data-invalid={Boolean(errors.endDate) || undefined}>
              <FieldLabel htmlFor="leave-end">Bitiş</FieldLabel>
              <Input
                id="leave-end"
                type="date"
                aria-invalid={Boolean(errors.endDate)}
                {...form.register("endDate")}
              />
              <FieldError errors={[errors.endDate]} />
            </Field>
          </div>
          {type === "sick_report" ? (
            <Alert>
              <InfoIcon />
              <AlertDescription>
                KVKK: Sağlık raporunda yalnızca tarih aralığı tutulur. Tanı,
                hastane veya açıklama girmeyin.
              </AlertDescription>
            </Alert>
          ) : (
            <Field data-invalid={Boolean(errors.note) || undefined}>
              <FieldLabel htmlFor="leave-note">
                Açıklama (isteğe bağlı)
              </FieldLabel>
              <Textarea id="leave-note" rows={2} {...form.register("note")} />
              <FieldDescription>Onaylayan kişi görür.</FieldDescription>
              <FieldError errors={[errors.note]} />
            </Field>
          )}
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="leave-request" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Talep oluştur
        </Button>
      </DialogFooter>
    </>
  )
}
