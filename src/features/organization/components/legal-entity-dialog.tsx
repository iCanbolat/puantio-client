import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import {
  createLegalEntity,
  legalEntityInputSchema,
  legalEntityKeys,
  updateLegalEntity,
  type LegalEntity,
} from "@/entities/legal-entity"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
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
import { Label } from "@/shared/ui/label"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

/** Form: SGK numaraları satır satır girilir */
const formSchema = legalEntityInputSchema
  .omit({ sgkWorkplaceNumbers: true, address: true })
  .extend({ sgkText: z.string(), address: z.string() })
  .superRefine((value, context) => {
    const lines = value.sgkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const result =
      legalEntityInputSchema.shape.sgkWorkplaceNumbers.safeParse(lines)
    if (!result.success) {
      context.addIssue({
        code: "custom",
        path: ["sgkText"],
        message: result.error.issues[0]?.message ?? "Geçersiz numara",
      })
    }
  })
type FormValues = z.input<typeof formSchema>

const FIELDS = [
  "title",
  "taxNumber",
  "taxOffice",
  "sgkText",
  "address",
] as const

export function LegalEntityDialog({
  open,
  entity,
  onClose,
}: {
  open: boolean
  entity: LegalEntity | null
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
          <LegalEntityForm
            key={entity?.id ?? "new"}
            entity={entity}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function LegalEntityForm({
  entity,
  onDone,
}: {
  entity: LegalEntity | null
  onDone: () => void
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: entity?.title ?? "",
      taxNumber: entity?.taxNumber ?? "",
      taxOffice: entity?.taxOffice ?? "",
      sgkText: entity?.sgkWorkplaceNumbers.join("\n") ?? "",
      eInvoiceEnabled: entity?.eInvoiceEnabled ?? false,
      address: entity?.address ?? "",
      isActive: entity?.isActive ?? true,
    },
  })
  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const body = legalEntityInputSchema.parse({
        title: values.title,
        taxNumber: values.taxNumber,
        taxOffice: values.taxOffice,
        sgkWorkplaceNumbers: values.sgkText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        eInvoiceEnabled: values.eInvoiceEnabled,
        address: values.address.trim() === "" ? null : values.address,
        isActive: values.isActive,
      })
      return entity
        ? updateLegalEntity(entity.id, body)
        : createLegalEntity(body)
    },
    meta: {
      successMessage: entity
        ? "Tüzel kişilik güncellendi"
        : "Tüzel kişilik eklendi",
      invalidates: [legalEntityKeys.all],
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
  const id = entity?.id ?? "yeni"

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {entity ? "Tüzel kişiliği düzenle" : "Yeni tüzel kişilik"}
        </DialogTitle>
        <DialogDescription>
          Personel, sözleşme, puantaj dönemi ve bordro dosyası tüzel kişilik
          bazında ayrılır.
        </DialogDescription>
      </DialogHeader>
      <form
        id={`le-${id}`}
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          {errors.root?.server?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={Boolean(errors.title) || undefined}>
            <FieldLabel htmlFor={`le-title-${id}`}>Unvan</FieldLabel>
            <Input
              id={`le-title-${id}`}
              aria-invalid={Boolean(errors.title)}
              {...form.register("title")}
            />
            <FieldError errors={[errors.title]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.taxNumber) || undefined}>
              <FieldLabel htmlFor={`le-vkn-${id}`}>Vergi kimlik no</FieldLabel>
              <Input
                id={`le-vkn-${id}`}
                inputMode="numeric"
                maxLength={10}
                aria-invalid={Boolean(errors.taxNumber)}
                {...form.register("taxNumber")}
              />
              <FieldError errors={[errors.taxNumber]} />
            </Field>
            <Field data-invalid={Boolean(errors.taxOffice) || undefined}>
              <FieldLabel htmlFor={`le-vd-${id}`}>Vergi dairesi</FieldLabel>
              <Input
                id={`le-vd-${id}`}
                aria-invalid={Boolean(errors.taxOffice)}
                {...form.register("taxOffice")}
              />
              <FieldError errors={[errors.taxOffice]} />
            </Field>
          </div>
          <Field data-invalid={Boolean(errors.sgkText) || undefined}>
            <FieldLabel htmlFor={`le-sgk-${id}`}>
              SGK işyeri sicil numaraları
            </FieldLabel>
            <Textarea
              id={`le-sgk-${id}`}
              rows={3}
              className="font-mono text-xs"
              aria-invalid={Boolean(errors.sgkText)}
              {...form.register("sgkText")}
            />
            <FieldDescription>
              Her satıra bir numara (26 hane).
            </FieldDescription>
            <FieldError errors={[errors.sgkText]} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`le-address-${id}`}>Adres</FieldLabel>
            <Textarea
              id={`le-address-${id}`}
              rows={2}
              {...form.register("address")}
            />
          </Field>
          <div className="flex flex-wrap gap-6">
            <Controller
              control={form.control}
              name="eInvoiceEnabled"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`le-einv-${id}`}
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked)
                    }}
                  />
                  <Label htmlFor={`le-einv-${id}`}>e-Fatura mükellefi</Label>
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`le-active-${id}`}
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked)
                    }}
                  />
                  <Label htmlFor={`le-active-${id}`}>Aktif</Label>
                </div>
              )}
            />
          </div>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form={`le-${id}`} disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
