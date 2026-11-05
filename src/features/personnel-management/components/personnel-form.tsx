import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { legalEntityQueries } from "@/entities/legal-entity"
import { LocationCombobox } from "@/entities/location"
import {
  PERSONNEL_STATUSES,
  PERSONNEL_STATUS_LABELS,
  POSITIONS,
  POSITION_LABELS,
  createPersonnel,
  personnelInputSchema,
  personnelKeys,
  updatePersonnel,
  type PersonnelDetail,
  type PersonnelInput,
  type PersonnelPayload,
} from "@/entities/personnel"
import { SERVICE_LINE_LABELS, useTenant, useTerms } from "@/entities/tenant"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { toIsoDate } from "@/shared/lib/date"
import { serverNow } from "@/shared/lib/server-time"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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
  "firstName",
  "lastName",
  "tckn",
  "employeeNumber",
  "phone",
  "position",
  "serviceLine",
  "legalEntityId",
  "homeLocationId",
  "hireDate",
  "terminationDate",
] as const

function SimpleSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  invalid,
  placeholder,
}: {
  id: string
  value: T | null
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
  invalid?: boolean
  placeholder?: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
      items={options}
    >
      <SelectTrigger
        id={id}
        className="w-full"
        aria-invalid={invalid || undefined}
      >
        <SelectValue placeholder={placeholder ?? "Seçin"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function PersonnelForm({
  person,
  onSaved,
  onCancel,
}: {
  person: PersonnelDetail | null
  onSaved: (person: PersonnelDetail) => void
  onCancel: () => void
}) {
  const tenant = useTenant()
  const terms = useTerms()
  const legalEntities = useQuery(legalEntityQueries.list())
  const [locationLabel, setLocationLabel] = useState(
    person?.homeLocationName ?? undefined
  )
  const form = useForm<PersonnelInput, unknown, PersonnelPayload>({
    resolver: zodResolver(personnelInputSchema),
    defaultValues: {
      firstName: person?.firstName ?? "",
      lastName: person?.lastName ?? "",
      tckn: person?.tckn ?? "",
      employeeNumber: person?.employeeNumber ?? "",
      phone: person?.phone ?? "",
      position: person?.position ?? POSITIONS[0],
      serviceLine: person?.serviceLine ?? tenant.serviceLines[0] ?? "cleaning",
      // Tek tüzel kişilik varsa önceden seçilir; birden fazlaysa kullanıcı seçmeli
      legalEntityId: person?.legalEntityId ?? "",
      homeLocationId: person?.homeLocationId ?? null,
      isFloater: person?.isFloater ?? false,
      status: person?.status ?? "active",
      hireDate: person?.hireDate ?? toIsoDate(serverNow()),
      terminationDate: person?.terminationDate ?? null,
    },
  })
  const status = useWatch({ control: form.control, name: "status" })
  const mutation = useMutation({
    mutationFn: (values: PersonnelPayload) =>
      person ? updatePersonnel(person.id, values) : createPersonnel(values),
    meta: {
      successMessage: "Personel kaydedildi",
      invalidates: [personnelKeys.all],
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
  const entities = (legalEntities.data ?? []).filter(
    (entity) => entity.isActive || entity.id === person?.legalEntityId
  )
  const onlyEntity = entities.length === 1 ? entities[0]?.id : undefined
  useEffect(() => {
    if (onlyEntity && !form.getValues("legalEntityId"))
      form.setValue("legalEntityId", onlyEntity)
  }, [onlyEntity, form])

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
          <CardTitle>Kimlik ve iletişim</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.firstName) || undefined}>
                <FieldLabel htmlFor="person-first">Ad</FieldLabel>
                <Input
                  id="person-first"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.firstName)}
                  {...form.register("firstName")}
                />
                <FieldError errors={[errors.firstName]} />
              </Field>
              <Field data-invalid={Boolean(errors.lastName) || undefined}>
                <FieldLabel htmlFor="person-last">Soyad</FieldLabel>
                <Input
                  id="person-last"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.lastName)}
                  {...form.register("lastName")}
                />
                <FieldError errors={[errors.lastName]} />
              </Field>
              <Field data-invalid={Boolean(errors.tckn) || undefined}>
                <FieldLabel htmlFor="person-tckn">T.C. Kimlik No</FieldLabel>
                <Input
                  id="person-tckn"
                  inputMode="numeric"
                  maxLength={11}
                  autoComplete="off"
                  aria-invalid={Boolean(errors.tckn)}
                  {...form.register("tckn")}
                />
                <FieldError errors={[errors.tckn]} />
              </Field>
              <Field data-invalid={Boolean(errors.phone) || undefined}>
                <FieldLabel htmlFor="person-phone">Cep telefonu</FieldLabel>
                <Input
                  id="person-phone"
                  type="tel"
                  placeholder="05XX XXX XX XX"
                  aria-invalid={Boolean(errors.phone)}
                  {...form.register("phone")}
                />
                <FieldDescription>
                  Saha uygulamasına SMS ile giriş bu numarayla yapılır.
                </FieldDescription>
                <FieldError errors={[errors.phone]} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Görev bilgileri</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.employeeNumber) || undefined}>
                <FieldLabel htmlFor="person-number">Sicil no</FieldLabel>
                <Input
                  id="person-number"
                  className="uppercase"
                  aria-invalid={Boolean(errors.employeeNumber)}
                  {...form.register("employeeNumber")}
                />
                <FieldError errors={[errors.employeeNumber]} />
              </Field>
              <Field data-invalid={Boolean(errors.legalEntityId) || undefined}>
                <FieldLabel htmlFor="person-legal">
                  İşveren (tüzel kişilik)
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="legalEntityId"
                  render={({ field }) => (
                    <SimpleSelect
                      id="person-legal"
                      value={field.value || null}
                      onChange={field.onChange}
                      options={entities.map((entity) => ({
                        value: entity.id,
                        label: entity.title,
                      }))}
                      invalid={Boolean(errors.legalEntityId)}
                      placeholder="İşveren seçin"
                    />
                  )}
                />
                <FieldError errors={[errors.legalEntityId]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="person-position">Pozisyon</FieldLabel>
                <Controller
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <SimpleSelect
                      id="person-position"
                      value={field.value}
                      onChange={field.onChange}
                      options={POSITIONS.map((position) => ({
                        value: position,
                        label: POSITION_LABELS[position],
                      }))}
                    />
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="person-line">Hizmet hattı</FieldLabel>
                <Controller
                  control={form.control}
                  name="serviceLine"
                  render={({ field }) => (
                    <SimpleSelect
                      id="person-line"
                      value={field.value}
                      onChange={field.onChange}
                      options={tenant.serviceLines.map((line) => ({
                        value: line,
                        label: SERVICE_LINE_LABELS[line],
                      }))}
                    />
                  )}
                />
              </Field>
              <Field data-invalid={Boolean(errors.homeLocationId) || undefined}>
                <FieldLabel>Ana {terms.lower(terms.location)}</FieldLabel>
                <Controller
                  control={form.control}
                  name="homeLocationId"
                  render={({ field }) => (
                    <LocationCombobox
                      aria-label={`Ana ${terms.lower(terms.location)}`}
                      value={field.value ?? null}
                      selectedLabel={locationLabel}
                      onValueChange={(value, label) => {
                        field.onChange(value)
                        setLocationLabel(label ?? undefined)
                      }}
                      className="w-full"
                    />
                  )}
                />
                <FieldError errors={[errors.homeLocationId]} />
              </Field>
              <Controller
                control={form.control}
                name="isFloater"
                render={({ field }) => (
                  <div className="flex items-center gap-2 sm:pt-7">
                    <Checkbox
                      id="person-floater"
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked)
                      }}
                    />
                    <Label htmlFor="person-floater">
                      Yedek havuzunda (gelmeyen personelin yerine atanabilir)
                    </Label>
                  </div>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="person-status">Durum</FieldLabel>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <SimpleSelect
                      id="person-status"
                      value={field.value}
                      onChange={field.onChange}
                      options={PERSONNEL_STATUSES.map((item) => ({
                        value: item,
                        label: PERSONNEL_STATUS_LABELS[item],
                      }))}
                    />
                  )}
                />
              </Field>
              <Field data-invalid={Boolean(errors.hireDate) || undefined}>
                <FieldLabel htmlFor="person-hire">İşe giriş</FieldLabel>
                <Input
                  id="person-hire"
                  type="date"
                  aria-invalid={Boolean(errors.hireDate)}
                  {...form.register("hireDate")}
                />
                <FieldError errors={[errors.hireDate]} />
              </Field>
              {status === "terminated" ? (
                <Field
                  data-invalid={Boolean(errors.terminationDate) || undefined}
                >
                  <FieldLabel htmlFor="person-termination">
                    İşten çıkış
                  </FieldLabel>
                  <Input
                    id="person-termination"
                    type="date"
                    aria-invalid={Boolean(errors.terminationDate)}
                    {...form.register("terminationDate", {
                      setValueAs: (value: string) => (value ? value : null),
                    })}
                  />
                  <FieldError errors={[errors.terminationDate]} />
                </Field>
              ) : null}
            </div>
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
