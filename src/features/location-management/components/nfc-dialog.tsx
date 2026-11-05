import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { assignNfcTag, locationKeys, nfcUidSchema } from "@/entities/location"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
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
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"

export interface NfcTarget {
  targetType: "location" | "area"
  targetId: string
  label: string
  current: string | null
}

const schema = z.object({ value: nfcUidSchema })

export function NfcDialog({
  locationId,
  target,
  onClose,
}: {
  locationId: string
  target: NfcTarget | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        {target ? (
          <NfcForm
            key={target.targetId}
            locationId={locationId}
            target={target}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function NfcForm({
  locationId,
  target,
  onDone,
}: {
  locationId: string
  target: NfcTarget
  onDone: () => void
}) {
  const form = useForm<
    z.input<typeof schema>,
    unknown,
    z.output<typeof schema>
  >({
    resolver: zodResolver(schema),
    defaultValues: { value: "" },
  })
  const mutation = useMutation({
    mutationFn: (value: string) =>
      assignNfcTag({
        targetType: target.targetType,
        targetId: target.targetId,
        value,
      }),
    meta: {
      successMessage: "NFC etiketi atandı",
      invalidates: [locationKeys.detail(locationId)],
    },
  })
  const onSubmit = form.handleSubmit(async ({ value }) => {
    try {
      await mutation.mutateAsync(value)
      onDone()
    } catch (error) {
      applyApiErrorToForm(error, form.setError, ["value"])
    }
  })
  const { errors, isSubmitting } = form.formState
  return (
    <>
      <DialogHeader>
        <DialogTitle>NFC etiketi ata</DialogTitle>
        <DialogDescription>
          {target.label}
          {target.current
            ? ` · Mevcut etiket (${target.current}) iptal edilir.`
            : ""}
        </DialogDescription>
      </DialogHeader>
      <form id="nfc-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <Field data-invalid={Boolean(errors.value) || undefined}>
          <FieldLabel htmlFor="nfc-uid">Etiket UID</FieldLabel>
          <Input
            id="nfc-uid"
            className="font-mono uppercase"
            placeholder="04:A2:3B:1C:5D:80:90"
            aria-invalid={Boolean(errors.value)}
            {...form.register("value")}
          />
          <FieldDescription>
            Saha uygulamasında etiketi okutarak da öğrenebilirsiniz.
          </FieldDescription>
          <FieldError errors={[errors.value]} />
        </Field>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="nfc-form" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Ata
        </Button>
      </DialogFooter>
    </>
  )
}
