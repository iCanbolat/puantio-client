import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"

import {
  createOrgUnit,
  orgUnitInputSchema,
  orgUnitKeys,
  updateOrgUnit,
  type OrgUnit,
  type OrgUnitInput,
} from "@/entities/org-unit"
import { useTerms } from "@/entities/tenant"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Spinner } from "@/shared/ui/spinner"

export interface OrgUnitDialogState {
  unit: OrgUnit | null
  level: number
  parent: OrgUnit | null
}

const FIELDS = ["code", "name", "parentId"] as const

export function OrgUnitDialog({
  state,
  onClose,
}: {
  state: OrgUnitDialogState | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        {state ? (
          <OrgUnitForm
            key={state.unit?.id ?? `new-${state.parent?.id ?? "root"}`}
            state={state}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function OrgUnitForm({
  state,
  onDone,
}: {
  state: OrgUnitDialogState
  onDone: () => void
}) {
  const terms = useTerms()
  const term = terms.orgLevels[state.level] ??
    terms.orgLevels[0] ?? { singular: "Bölge", plural: "Bölgeler" }
  const form = useForm<OrgUnitInput>({
    resolver: zodResolver(orgUnitInputSchema),
    defaultValues: {
      level: state.level,
      parentId: state.unit?.parentId ?? state.parent?.id ?? null,
      code: state.unit?.code ?? "",
      name: state.unit?.name ?? "",
      isActive: state.unit?.isActive ?? true,
    },
  })
  const mutation = useMutation({
    mutationFn: (values: OrgUnitInput) =>
      state.unit ? updateOrgUnit(state.unit.id, values) : createOrgUnit(values),
    meta: {
      successMessage: `${term.singular} kaydedildi`,
      invalidates: [orgUnitKeys.all],
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
        <DialogTitle>
          {state.unit
            ? `${term.singular} düzenle`
            : `Yeni ${terms.lower(term)}`}
          {state.parent ? ` · ${state.parent.name}` : ""}
        </DialogTitle>
      </DialogHeader>
      <form
        id="org-unit-form"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          {errors.root?.server?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          ) : null}
          {errors.parentId?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.parentId.message}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={Boolean(errors.code) || undefined}>
            <FieldLabel htmlFor="org-unit-code">Kod</FieldLabel>
            <Input
              id="org-unit-code"
              className="uppercase"
              aria-invalid={Boolean(errors.code)}
              {...form.register("code")}
            />
            <FieldError errors={[errors.code]} />
          </Field>
          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="org-unit-name">Ad</FieldLabel>
            <Input
              id="org-unit-name"
              aria-invalid={Boolean(errors.name)}
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="org-unit-active"
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked)
                  }}
                />
                <Label htmlFor="org-unit-active">Aktif</Label>
              </div>
            )}
          />
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="org-unit-form" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
