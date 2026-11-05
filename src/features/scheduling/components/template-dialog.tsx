import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"

import {
  SHIFT_COLORS,
  createShiftTemplate,
  shiftKeys,
  shiftTemplateInputSchema,
  templateNetMinutes,
  updateShiftTemplate,
  type ShiftTemplate,
  type ShiftTemplateInput,
  type ShiftTemplatePayload,
} from "@/entities/shift"
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

import { SHIFT_COLOR_LABELS } from "./shift-colors"

const FIELDS = [
  "code",
  "name",
  "kind",
  "segments",
  "breakMinutes",
  "color",
] as const

export function TemplateDialog({
  open,
  template,
  onClose,
}: {
  open: boolean
  template: ShiftTemplate | null
  onClose: () => void
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
          <TemplateForm
            key={template?.id ?? "new"}
            template={template}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function TemplateForm({
  template,
  onDone,
}: {
  template: ShiftTemplate | null
  onDone: () => void
}) {
  const form = useForm<ShiftTemplateInput, unknown, ShiftTemplatePayload>({
    resolver: zodResolver(shiftTemplateInputSchema),
    defaultValues: {
      code: template?.code ?? "",
      name: template?.name ?? "",
      kind: template?.kind === "split" ? "split" : "standard",
      segments: template?.segments.length
        ? template.segments
        : [{ start: "08:00", end: "16:00" }],
      breakMinutes: template?.breakMinutes ?? 30,
      color: template?.color ?? "sky",
    },
  })
  const segments = useFieldArray({ control: form.control, name: "segments" })
  const kind = useWatch({ control: form.control, name: "kind" })
  const watched = useWatch({ control: form.control })
  const parsed = shiftTemplateInputSchema.safeParse(watched)
  const net = parsed.success ? templateNetMinutes(parsed.data) / 60 : null
  const mutation = useMutation({
    mutationFn: (values: ShiftTemplatePayload) =>
      template
        ? updateShiftTemplate(template.id, values)
        : createShiftTemplate(values),
    meta: {
      successMessage: template ? "Şablon güncellendi" : "Şablon eklendi",
      invalidates: [shiftKeys.all],
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
  const segmentError =
    errors.segments?.message ?? errors.segments?.root?.message

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {template ? "Şablonu düzenle" : "Yeni vardiya şablonu"}
        </DialogTitle>
        <DialogDescription>
          Bitiş başlangıçtan önceyse vardiya ertesi güne taşar (ör.
          23:00–07:00).
        </DialogDescription>
      </DialogHeader>
      <form
        id="template-form"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          {errors.root?.server?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
            <Field data-invalid={Boolean(errors.code) || undefined}>
              <FieldLabel htmlFor="tpl-code">Kısa kod</FieldLabel>
              <Input
                id="tpl-code"
                maxLength={4}
                aria-invalid={Boolean(errors.code)}
                {...form.register("code")}
              />
              <FieldError errors={[errors.code]} />
            </Field>
            <Field data-invalid={Boolean(errors.name) || undefined}>
              <FieldLabel htmlFor="tpl-name">Ad</FieldLabel>
              <Input
                id="tpl-name"
                aria-invalid={Boolean(errors.name)}
                {...form.register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="tpl-kind">Tür</FieldLabel>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <SimpleSelect
                    id="tpl-kind"
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: "standard", label: "Tek parça" },
                      { value: "split", label: "Parçalı" },
                    ]}
                  />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tpl-color">Renk</FieldLabel>
              <Controller
                control={form.control}
                name="color"
                render={({ field }) => (
                  <SimpleSelect
                    id="tpl-color"
                    value={field.value}
                    onChange={field.onChange}
                    options={SHIFT_COLORS.map((value) => ({
                      value,
                      label: SHIFT_COLOR_LABELS[value],
                    }))}
                  />
                )}
              />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              Zaman aralıkları
            </legend>
            {segments.fields.map((segment, index) => (
              <div key={segment.id} className="flex items-end gap-2">
                <Field className="flex-1">
                  <FieldLabel htmlFor={`tpl-start-${index}`}>
                    Başlangıç
                  </FieldLabel>
                  <Input
                    id={`tpl-start-${index}`}
                    type="time"
                    {...form.register(`segments.${index}.start`)}
                  />
                </Field>
                <Field className="flex-1">
                  <FieldLabel htmlFor={`tpl-end-${index}`}>Bitiş</FieldLabel>
                  <Input
                    id={`tpl-end-${index}`}
                    type="time"
                    {...form.register(`segments.${index}.end`)}
                  />
                </Field>
                {segments.fields.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${index + 1}. aralığı sil`}
                    onClick={() => {
                      segments.remove(index)
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </div>
            ))}
            {kind === "split" && segments.fields.length < 3 ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => {
                  segments.append({ start: "16:00", end: "20:00" })
                }}
              >
                <PlusIcon data-icon="inline-start" />
                Aralık ekle
              </Button>
            ) : null}
            {segmentError ? (
              <p role="alert" className="text-sm text-destructive">
                {segmentError}
              </p>
            ) : null}
          </fieldset>
          <Field data-invalid={Boolean(errors.breakMinutes) || undefined}>
            <FieldLabel htmlFor="tpl-break">Mola (dk)</FieldLabel>
            <Input
              id="tpl-break"
              type="number"
              min={0}
              aria-invalid={Boolean(errors.breakMinutes)}
              {...form.register("breakMinutes", { valueAsNumber: true })}
            />
            <FieldDescription>
              Net çalışma:{" "}
              {net === null ? "—" : `${net.toLocaleString("tr-TR")} saat`}
            </FieldDescription>
            <FieldError errors={[errors.breakMinutes]} />
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="template-form" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
