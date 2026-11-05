import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { MapIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { CustomerCombobox } from "@/entities/customer"
import {
  CERTIFICATE_LABELS,
  CERTIFICATE_TYPES,
  LOCATION_STATUSES,
  LOCATION_STATUS_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  createLocation,
  createLocationInputSchema,
  locationKeys,
  updateLocation,
  type Location,
  type LocationInput,
} from "@/entities/location"
import { OrgUnitSelect } from "@/entities/org-unit"
import { SERVICE_LINE_LABELS, useTenant, useTerms } from "@/entities/tenant"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { MapPickerLazy } from "@/shared/components/map-picker"
import { GeofenceRadiusControl } from "@/shared/components/map-picker"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Spinner } from "@/shared/ui/spinner"

const FIELDS = [
  "code",
  "name",
  "customerId",
  "orgUnitId",
  "serviceLines",
  "address.city",
  "address.district",
  "address.line",
  "geofence.radiusMeters",
  "targetHeadcount",
] as const

const DEFAULT_CENTER = { lat: 41.0082, lng: 28.9784 }

function CheckboxList<T extends string | number>({
  idPrefix,
  options,
  labels,
  value,
  onChange,
}: {
  idPrefix: string
  options: readonly T[]
  labels: Record<string, string>
  value: readonly T[]
  onChange: (value: T[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((option) => {
        const id = `${idPrefix}-${option}`
        return (
          <div key={option} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={value.includes(option)}
              onCheckedChange={(checked) => {
                onChange(
                  checked
                    ? [...value, option]
                    : value.filter((item) => item !== option)
                )
              }}
            />
            <Label htmlFor={id}>{labels[String(option)]}</Label>
          </div>
        )
      })}
    </div>
  )
}

export function LocationForm({
  location,
  onSaved,
  onCancel,
}: {
  location: Location | null
  onSaved: (location: Location) => void
  onCancel: () => void
}) {
  const tenant = useTenant()
  const terms = useTerms()
  const limits = tenant.rules.geofence
  const schema = useMemo(() => createLocationInputSchema(limits), [limits])
  const [showMap, setShowMap] = useState(true)
  const [customerLabel, setCustomerLabel] = useState(location?.customerName)

  const form = useForm<LocationInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: location?.code ?? "",
      name: location?.name ?? "",
      customerId: location?.customerId ?? "",
      orgUnitId: location?.orgUnitId ?? "",
      serviceLines: location?.serviceLines ?? tenant.serviceLines.slice(0, 1),
      address: location?.address ?? { city: "", district: "", line: "" },
      geofence: location?.geofence ?? {
        center: DEFAULT_CENTER,
        radiusMeters: limits.default,
      },
      workingHours: location?.workingHours ?? {
        days: [1, 2, 3, 4, 5],
        start: "07:00",
        end: "19:00",
      },
      targetHeadcount: location?.targetHeadcount ?? 1,
      requiredCertificates: location?.requiredCertificates ?? [],
      status: location?.status ?? "active",
    },
  })
  const geofence = useWatch({ control: form.control, name: "geofence" })
  const mutation = useMutation({
    mutationFn: (values: LocationInput) =>
      location ? updateLocation(location.id, values) : createLocation(values),
    meta: {
      successMessage: `${terms.location.singular} kaydedildi`,
      invalidates: [locationKeys.all],
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      onSaved(await mutation.mutateAsync(values))
    } catch (error) {
      applyApiErrorToForm(error, form.setError, FIELDS)
    }
  })
  const { errors, isSubmitting } = form.formState
  const leafTerm = terms.orgLevels.at(-1) ?? {
    singular: "Bölge",
    plural: "Bölgeler",
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex flex-col gap-6"
    >
      {errors.root?.server?.message ? (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.server.message}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Genel bilgiler</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <Field data-invalid={Boolean(errors.code) || undefined}>
                <FieldLabel htmlFor="location-code">Kod</FieldLabel>
                <Input
                  id="location-code"
                  className="uppercase"
                  aria-invalid={Boolean(errors.code)}
                  {...form.register("code")}
                />
                <FieldError errors={[errors.code]} />
              </Field>
              <Field data-invalid={Boolean(errors.name) || undefined}>
                <FieldLabel htmlFor="location-name">Ad</FieldLabel>
                <Input
                  id="location-name"
                  aria-invalid={Boolean(errors.name)}
                  {...form.register("name")}
                />
                <FieldError errors={[errors.name]} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.customerId) || undefined}>
                <FieldLabel>Müşteri</FieldLabel>
                <Controller
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <CustomerCombobox
                      value={field.value || null}
                      selectedLabel={customerLabel}
                      onValueChange={(value, label) => {
                        field.onChange(value ?? "")
                        setCustomerLabel(label ?? undefined)
                      }}
                      className="w-full"
                    />
                  )}
                />
                <FieldError errors={[errors.customerId]} />
              </Field>
              <Field data-invalid={Boolean(errors.orgUnitId) || undefined}>
                <FieldLabel htmlFor="location-org-unit">
                  {leafTerm.singular}
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="orgUnitId"
                  render={({ field }) => (
                    <OrgUnitSelect
                      id="location-org-unit"
                      leafOnly
                      value={field.value || null}
                      onValueChange={(value) => {
                        field.onChange(value ?? "")
                      }}
                      className="w-full"
                      invalid={Boolean(errors.orgUnitId)}
                    />
                  )}
                />
                <FieldError errors={[errors.orgUnitId]} />
              </Field>
            </div>
            <FieldSet data-invalid={Boolean(errors.serviceLines) || undefined}>
              <FieldLegend variant="label">Hizmet hatları</FieldLegend>
              <Controller
                control={form.control}
                name="serviceLines"
                render={({ field }) => (
                  <CheckboxList
                    idPrefix="service-line"
                    options={tenant.serviceLines}
                    labels={SERVICE_LINE_LABELS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <FieldError errors={[errors.serviceLines]} />
            </FieldSet>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                data-invalid={Boolean(errors.targetHeadcount) || undefined}
              >
                <FieldLabel htmlFor="location-headcount">
                  Hedef kadro
                </FieldLabel>
                <Input
                  id="location-headcount"
                  type="number"
                  inputMode="numeric"
                  aria-invalid={Boolean(errors.targetHeadcount)}
                  {...form.register("targetHeadcount", { valueAsNumber: true })}
                />
                <FieldError errors={[errors.targetHeadcount]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="location-status">Durum</FieldLabel>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        if (value) field.onChange(value)
                      }}
                      items={LOCATION_STATUSES.map((status) => ({
                        value: status,
                        label: LOCATION_STATUS_LABELS[status],
                      }))}
                    >
                      <SelectTrigger id="location-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LOCATION_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {LOCATION_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adres ve geofence</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={Boolean(errors.address?.city) || undefined}>
                <FieldLabel htmlFor="location-city">İl</FieldLabel>
                <Input
                  id="location-city"
                  aria-invalid={Boolean(errors.address?.city)}
                  {...form.register("address.city")}
                />
                <FieldError errors={[errors.address?.city]} />
              </Field>
              <Field
                data-invalid={Boolean(errors.address?.district) || undefined}
              >
                <FieldLabel htmlFor="location-district">İlçe</FieldLabel>
                <Input
                  id="location-district"
                  aria-invalid={Boolean(errors.address?.district)}
                  {...form.register("address.district")}
                />
                <FieldError errors={[errors.address?.district]} />
              </Field>
              <Field
                data-invalid={Boolean(errors.address?.line) || undefined}
                className="sm:col-span-3"
              >
                <FieldLabel htmlFor="location-line">Açık adres</FieldLabel>
                <Input
                  id="location-line"
                  aria-invalid={Boolean(errors.address?.line)}
                  {...form.register("address.line")}
                />
                <FieldError errors={[errors.address?.line]} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr] sm:items-start">
              <Field>
                <FieldLabel htmlFor="location-lat">Enlem</FieldLabel>
                <Input
                  id="location-lat"
                  type="number"
                  step="0.000001"
                  {...form.register("geofence.center.lat", {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="location-lng">Boylam</FieldLabel>
                <Input
                  id="location-lng"
                  type="number"
                  step="0.000001"
                  {...form.register("geofence.center.lng", {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Controller
                control={form.control}
                name="geofence.radiusMeters"
                render={({ field }) => (
                  <GeofenceRadiusControl
                    value={field.value}
                    onChange={field.onChange}
                    limits={limits}
                    clampOnBlur={false}
                    error={errors.geofence?.radiusMeters?.message}
                  />
                )}
              />
            </div>
            {showMap ? (
              <MapPickerLazy
                // Form ara değerleri (boş alan = NaN) haritaya gitmez; Leaflet geçersiz koordinatta çöker
                value={{
                  center: {
                    lat: Number.isFinite(geofence.center.lat)
                      ? geofence.center.lat
                      : DEFAULT_CENTER.lat,
                    lng: Number.isFinite(geofence.center.lng)
                      ? geofence.center.lng
                      : DEFAULT_CENTER.lng,
                  },
                  radiusMeters: Number.isFinite(geofence.radiusMeters)
                    ? geofence.radiusMeters
                    : limits.default,
                }}
                limits={limits}
                showRadiusControl={false}
                height={320}
                onChange={(next) => {
                  form.setValue("geofence.center", next.center, {
                    shouldDirty: true,
                  })
                }}
              />
            ) : (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowMap(true)
                  }}
                >
                  <MapIcon data-icon="inline-start" />
                  Haritada seç
                </Button>
              </div>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Çalışma saatleri ve gereksinimler</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldSet
              data-invalid={Boolean(errors.workingHours?.days) || undefined}
            >
              <FieldLegend variant="label">Çalışma günleri</FieldLegend>
              <Controller
                control={form.control}
                name="workingHours.days"
                render={({ field }) => (
                  <CheckboxList
                    idPrefix="weekday"
                    options={WEEKDAYS}
                    labels={WEEKDAY_LABELS}
                    value={field.value}
                    onChange={(days) => {
                      field.onChange([...days].sort())
                    }}
                  />
                )}
              />
              <FieldError errors={[errors.workingHours?.days]} />
            </FieldSet>
            <div className="grid max-w-md gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="location-start">Başlangıç</FieldLabel>
                <Input
                  id="location-start"
                  type="time"
                  {...form.register("workingHours.start")}
                />
              </Field>
              <Field
                data-invalid={Boolean(errors.workingHours?.end) || undefined}
              >
                <FieldLabel htmlFor="location-end">Bitiş</FieldLabel>
                <Input
                  id="location-end"
                  type="time"
                  aria-invalid={Boolean(errors.workingHours?.end)}
                  {...form.register("workingHours.end")}
                />
                <FieldError errors={[errors.workingHours?.end]} />
              </Field>
            </div>
            <FieldSet>
              <FieldLegend variant="label">
                Gerekli sertifikalar (vardiya uygunluk kontrolü)
              </FieldLegend>
              <Controller
                control={form.control}
                name="requiredCertificates"
                render={({ field }) => (
                  <CheckboxList
                    idPrefix="certificate"
                    options={CERTIFICATE_TYPES}
                    labels={CERTIFICATE_LABELS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </FieldSet>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </div>
    </form>
  )
}
