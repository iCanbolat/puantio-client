import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"

import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { externalNavigation } from "@/shared/lib/navigation"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import { platformKeys, startSupportSession } from "../api/platform-api"
import {
  SUPPORT_DURATIONS,
  startSupportSchema,
  type PlatformTenant,
  type StartSupportInput,
} from "../model/platform"
import { tenantEntryUrl } from "./tenant-url"

export function SupportDialog({
  tenant,
  onClose,
}: {
  tenant: PlatformTenant | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={tenant !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        {tenant ? <SupportForm tenant={tenant} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function SupportForm({
  tenant,
  onDone,
}: {
  tenant: PlatformTenant
  onDone: () => void
}) {
  const form = useForm<StartSupportInput>({
    resolver: zodResolver(startSupportSchema),
    defaultValues: { reason: "", durationMinutes: 60 },
  })
  const mutation = useMutation({
    mutationFn: (values: StartSupportInput) =>
      startSupportSession(tenant.slug, values),
    meta: { invalidates: [platformKeys.sessions] },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values)
      onDone()
      externalNavigation.assign(tenantEntryUrl(tenant.slug))
    } catch (error) {
      applyApiErrorToForm(error, form.setError, ["reason", "durationMinutes"])
    }
  })
  const { errors, isSubmitting } = form.formState
  return (
    <>
      <DialogHeader>
        <DialogTitle>Destek oturumu başlat</DialogTitle>
        <DialogDescription>
          {tenant.displayName} verilerine salt okunur erişim açılır. Erişim
          firmanın denetim kayıtlarında görünür; sağlık verisi hiçbir koşulda
          gösterilmez.
        </DialogDescription>
      </DialogHeader>
      <form
        id="support-form"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          <Field data-invalid={Boolean(errors.reason) || undefined}>
            <FieldLabel htmlFor="support-reason">Gerekçe</FieldLabel>
            <Textarea
              id="support-reason"
              rows={3}
              placeholder="ör. Destek talebi #1234: puantaj dışa aktarım hatası"
              aria-invalid={Boolean(errors.reason)}
              {...form.register("reason")}
            />
            <FieldDescription>
              Firma yöneticisi bu gerekçeyi görür.
            </FieldDescription>
            <FieldError errors={[errors.reason]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="support-duration">Süre</FieldLabel>
            <Controller
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(value) => {
                    field.onChange(Number(value))
                  }}
                  items={SUPPORT_DURATIONS.map((minutes) => ({
                    value: String(minutes),
                    label: `${minutes} dakika`,
                  }))}
                >
                  <SelectTrigger id="support-duration" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORT_DURATIONS.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes} dakika
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
        <Button type="submit" form="support-form" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Başlat ve firmaya geç
        </Button>
      </DialogFooter>
    </>
  )
}
