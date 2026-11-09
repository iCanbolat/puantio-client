import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Controller, useForm, useWatch } from "react-hook-form"
import { useNavigate } from "react-router"

import {
  AREA_TYPE_LABELS,
  LocationCombobox,
  locationQueries,
} from "@/entities/location"
import { SERVICE_LINE_LABELS, useTenant, useTerms } from "@/entities/tenant"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { SimpleSelect } from "@/shared/components/simple-select"
import { paths } from "@/shared/config/paths"
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
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import { createWorkOrder, workOrderKeys } from "../api/work-order-api"
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_PRIORITY_LABELS,
  createWorkOrderSchema,
  type CreateWorkOrderInput,
} from "../model/work-order"

const FIELDS = [
  "title",
  "description",
  "locationId",
  "areaId",
  "priority",
  "serviceLine",
] as const
const NO_AREA = "__none__"

export function CreateWorkOrderDialog({
  open,
  onClose,
}: {
  open: boolean
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
        {open ? <CreateForm onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const tenant = useTenant()
  const terms = useTerms()
  const navigate = useNavigate()
  const form = useForm<CreateWorkOrderInput>({
    resolver: zodResolver(createWorkOrderSchema),
    defaultValues: {
      title: "",
      description: null,
      locationId: "",
      areaId: null,
      priority: "normal",
      serviceLine: tenant.serviceLines[0] ?? "cleaning",
    },
  })
  const locationId = useWatch({ control: form.control, name: "locationId" })
  const areas = useQuery({
    ...locationQueries.areas(locationId),
    enabled: Boolean(locationId),
  })
  const mutation = useMutation({
    mutationFn: createWorkOrder,
    meta: {
      successMessage: "İş emri oluşturuldu",
      invalidates: [workOrderKeys.all],
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const order = await mutation.mutateAsync(values)
      onDone()
      void navigate(paths.workOrders.detail(order.id))
    } catch (error) {
      applyApiErrorToForm(error, form.setError, FIELDS)
    }
  })
  const { errors, isSubmitting } = form.formState
  return (
    <>
      <DialogHeader>
        <DialogTitle>Yeni iş emri</DialogTitle>
        <DialogDescription>
          Manuel iş emri. QR bildirimleri ve kritik denetim maddeleri iş emrini
          otomatik açar.
        </DialogDescription>
      </DialogHeader>
      <form
        id="work-order-form"
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <FieldGroup>
          {errors.root?.server?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.server.message}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={Boolean(errors.title) || undefined}>
            <FieldLabel htmlFor="wo-title">Başlık</FieldLabel>
            <Input
              id="wo-title"
              aria-invalid={Boolean(errors.title)}
              {...form.register("title")}
            />
            <FieldError errors={[errors.title]} />
          </Field>
          <Controller
            control={form.control}
            name="locationId"
            render={({ field }) => (
              <Field data-invalid={Boolean(errors.locationId) || undefined}>
                <FieldLabel>{terms.location.singular}</FieldLabel>
                <LocationCombobox
                  value={field.value || null}
                  onValueChange={(value) => {
                    field.onChange(value ?? "")
                    form.setValue("areaId", null)
                  }}
                />
                <FieldError errors={[errors.locationId]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="areaId"
            render={({ field }) => (
              <Field data-invalid={Boolean(errors.areaId) || undefined}>
                <FieldLabel htmlFor="wo-area">
                  {terms.area.singular} (isteğe bağlı)
                </FieldLabel>
                <SimpleSelect
                  id="wo-area"
                  disabled={!locationId}
                  value={field.value ?? NO_AREA}
                  onChange={(value) => {
                    field.onChange(value === NO_AREA ? null : value)
                  }}
                  options={[
                    {
                      value: NO_AREA,
                      label: `${terms.area.singular} yok (genel)`,
                    },
                    ...(areas.data ?? []).map((area) => ({
                      value: area.id,
                      label: `${area.name} · ${AREA_TYPE_LABELS[area.type]}`,
                    })),
                  ]}
                />
                <FieldError errors={[errors.areaId]} />
              </Field>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="wo-priority">Öncelik</FieldLabel>
                  <SimpleSelect
                    id="wo-priority"
                    value={field.value}
                    onChange={field.onChange}
                    options={WORK_ORDER_PRIORITIES.map((value) => ({
                      value,
                      label: WORK_ORDER_PRIORITY_LABELS[value],
                    }))}
                  />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="serviceLine"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="wo-service">Hizmet hattı</FieldLabel>
                  <SimpleSelect
                    id="wo-service"
                    value={field.value}
                    onChange={field.onChange}
                    options={tenant.serviceLines.map((value) => ({
                      value,
                      label: SERVICE_LINE_LABELS[value],
                    }))}
                  />
                </Field>
              )}
            />
          </div>
          <Field data-invalid={Boolean(errors.description) || undefined}>
            <FieldLabel htmlFor="wo-description">
              Açıklama (isteğe bağlı)
            </FieldLabel>
            <Textarea
              id="wo-description"
              rows={3}
              {...form.register("description", {
                setValueAs: (value: string | null) =>
                  value?.trim() ? value : null,
              })}
            />
            <FieldError errors={[errors.description]} />
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="work-order-form" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Oluştur
        </Button>
      </DialogFooter>
    </>
  )
}
