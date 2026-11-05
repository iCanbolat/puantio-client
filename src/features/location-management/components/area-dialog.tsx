import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"

import {
  AREA_TYPES,
  AREA_TYPE_LABELS,
  areaInputSchema,
  createArea,
  locationKeys,
  updateArea,
  type Area,
  type AreaInput,
} from "@/entities/location"
import { useTerms } from "@/entities/tenant"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
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

export function AreaDialog({
  open,
  locationId,
  area,
  onClose,
}: {
  open: boolean
  locationId: string
  area: Area | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        {open ? (
          <AreaForm
            key={area?.id ?? "new"}
            locationId={locationId}
            area={area}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function AreaForm({
  locationId,
  area,
  onDone,
}: {
  locationId: string
  area: Area | null
  onDone: () => void
}) {
  const terms = useTerms()
  const form = useForm<AreaInput>({
    resolver: zodResolver(areaInputSchema),
    defaultValues: {
      name: area?.name ?? "",
      type: area?.type ?? "restroom",
      floor: area?.floor ?? "",
    },
  })
  const mutation = useMutation({
    mutationFn: (values: AreaInput) =>
      area ? updateArea(area.id, values) : createArea(locationId, values),
    meta: {
      successMessage: `${terms.area.singular} kaydedildi`,
      invalidates: [locationKeys.detail(locationId), locationKeys.lists()],
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values)
      onDone()
    } catch (error) {
      applyApiErrorToForm(error, form.setError, ["name", "type", "floor"])
    }
  })
  const { errors, isSubmitting } = form.formState
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {area
            ? `${terms.area.singular} düzenle`
            : `Yeni ${terms.lower(terms.area)}`}
        </DialogTitle>
      </DialogHeader>
      <form
        id="area-form"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <FieldGroup>
          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="area-name">Ad</FieldLabel>
            <Input
              id="area-name"
              aria-invalid={Boolean(errors.name)}
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="area-type">Tür</FieldLabel>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (value) field.onChange(value)
                    }}
                    items={AREA_TYPES.map((type) => ({
                      value: type,
                      label: AREA_TYPE_LABELS[type],
                    }))}
                  >
                    <SelectTrigger id="area-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AREA_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {AREA_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="area-floor">Kat</FieldLabel>
              <Input
                id="area-floor"
                placeholder="Zemin, 1, B1…"
                {...form.register("floor")}
              />
            </Field>
          </div>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="area-form" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
