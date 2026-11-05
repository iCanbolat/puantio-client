import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"

import { applyApiErrorToForm } from "@/shared/api/form-errors"
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
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Spinner } from "@/shared/ui/spinner"

import { showcaseKeys, updateShowcaseRecord } from "../api/showcase-api"
import {
  SHOWCASE_STATUSES,
  STATUS_LABELS,
  showcaseRecordUpdateSchema,
  type ShowcaseRecord,
  type ShowcaseRecordUpdate,
} from "../model/showcase-record"

const FIELDS = ["name", "score", "status"] as const

/**
 * Form deseni örneği: Zod ile istemci doğrulaması + sunucudan gelen 422 alan hatalarının
 * aynı alanlara yazılması. Sonraki fazlardaki tüm formlar bu deseni izler.
 *
 * Listelerde her satıra ayrı diyalog render edilmez; tablo seviyesinde tek bir kontrollü
 * diyalog düzenlenen kaydı alır.
 */
export function RecordEditDialog({
  record,
  onClose,
}: {
  record: ShowcaseRecord | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={record !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        {record ? (
          <RecordEditForm key={record.id} record={record} onDone={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RecordEditForm({
  record,
  onDone,
}: {
  record: ShowcaseRecord
  onDone: () => void
}) {
  const form = useForm<ShowcaseRecordUpdate>({
    resolver: zodResolver(showcaseRecordUpdateSchema),
    defaultValues: {
      name: record.name,
      score: record.score,
      status: record.status,
    },
  })
  const mutation = useMutation({
    mutationFn: (values: ShowcaseRecordUpdate) =>
      updateShowcaseRecord(record.id, values),
    meta: {
      successMessage: "Kayıt güncellendi",
      invalidates: [showcaseKeys.lists()],
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
        <DialogTitle>Kaydı düzenle</DialogTitle>
        <DialogDescription>{record.code}</DialogDescription>
      </DialogHeader>
      <form
        id={`edit-${record.id}`}
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          {errors.root?.server?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor={`name-${record.id}`}>Ad</FieldLabel>
            <Input
              id={`name-${record.id}`}
              aria-invalid={Boolean(errors.name)}
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={Boolean(errors.score) || undefined}>
            <FieldLabel htmlFor={`score-${record.id}`}>Kalite puanı</FieldLabel>
            <Input
              id={`score-${record.id}`}
              type="number"
              inputMode="numeric"
              aria-invalid={Boolean(errors.score)}
              {...form.register("score", { valueAsNumber: true })}
            />
            <FieldError errors={[errors.score]} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`status-${record.id}`}>Durum</FieldLabel>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value)
                  }}
                  items={SHOWCASE_STATUSES.map((status) => ({
                    value: status,
                    label: STATUS_LABELS[status],
                  }))}
                >
                  <SelectTrigger id={`status-${record.id}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOWCASE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button
          type="submit"
          form={`edit-${record.id}`}
          disabled={isSubmitting}
        >
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
