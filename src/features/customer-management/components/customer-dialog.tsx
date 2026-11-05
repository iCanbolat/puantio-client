import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Controller, useFieldArray, useForm } from "react-hook-form"

import {
  CUSTOMER_SECTORS,
  CUSTOMER_SECTOR_LABELS,
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_LABELS,
  createCustomer,
  customerInputSchema,
  customerKeys,
  updateCustomer,
  type Customer,
  type CustomerInput,
  type CustomerPayload,
} from "@/entities/customer"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Spinner } from "@/shared/ui/spinner"

const FIELDS = [
  "name",
  "type",
  "sector",
  "taxNumber",
  "taxOffice",
  "status",
] as const

function EnumSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  labels,
}: {
  id: string
  value: T
  onChange: (value: T) => void
  options: readonly T[]
  labels: Record<T, string>
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
      items={options.map((option) => ({
        value: option,
        label: labels[option],
      }))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CustomerDialog({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean
  customer: Customer | null
  onClose: () => void
  onSaved?: (customer: Customer) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {open ? (
          <CustomerForm
            key={customer?.id ?? "new"}
            customer={customer}
            onDone={onClose}
            {...(onSaved ? { onSaved } : {})}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CustomerForm({
  customer,
  onDone,
  onSaved,
}: {
  customer: Customer | null
  onDone: () => void
  onSaved?: (customer: Customer) => void
}) {
  const form = useForm<CustomerInput, unknown, CustomerPayload>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: {
      name: customer?.name ?? "",
      type: customer?.type ?? "private",
      sector: customer?.sector ?? "office",
      taxNumber: customer?.taxNumber ?? "",
      taxOffice: customer?.taxOffice ?? "",
      contacts:
        customer?.contacts.map((contact) => ({
          name: contact.name,
          title: contact.title ?? "",
          phone: contact.phone ?? "",
          email: contact.email ?? "",
          isPrimary: contact.isPrimary,
        })) ?? [],
      status: customer?.status ?? "active",
    },
  })
  const contacts = useFieldArray({ control: form.control, name: "contacts" })
  const mutation = useMutation({
    mutationFn: (values: CustomerPayload) =>
      customer ? updateCustomer(customer.id, values) : createCustomer(values),
    meta: {
      successMessage: customer ? "Müşteri güncellendi" : "Müşteri eklendi",
      invalidates: [customerKeys.all],
    },
  })
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await mutation.mutateAsync(values)
      onSaved?.(saved)
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
          {customer ? "Müşteriyi düzenle" : "Yeni müşteri"}
        </DialogTitle>
      </DialogHeader>
      <form
        id="customer-form"
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
            <FieldLabel htmlFor="customer-name">Müşteri adı</FieldLabel>
            <Input
              id="customer-name"
              aria-invalid={Boolean(errors.name)}
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="customer-type">Tür</FieldLabel>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <EnumSelect
                    id="customer-type"
                    value={field.value}
                    onChange={field.onChange}
                    options={CUSTOMER_TYPES}
                    labels={CUSTOMER_TYPE_LABELS}
                  />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-sector">Sektör</FieldLabel>
              <Controller
                control={form.control}
                name="sector"
                render={({ field }) => (
                  <EnumSelect
                    id="customer-sector"
                    value={field.value}
                    onChange={field.onChange}
                    options={CUSTOMER_SECTORS}
                    labels={CUSTOMER_SECTOR_LABELS}
                  />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-status">Durum</FieldLabel>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <EnumSelect
                    id="customer-status"
                    value={field.value}
                    onChange={field.onChange}
                    options={CUSTOMER_STATUSES}
                    labels={CUSTOMER_STATUS_LABELS}
                  />
                )}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.taxNumber) || undefined}>
              <FieldLabel htmlFor="customer-vkn">Vergi kimlik no</FieldLabel>
              <Input
                id="customer-vkn"
                inputMode="numeric"
                maxLength={10}
                aria-invalid={Boolean(errors.taxNumber)}
                {...form.register("taxNumber")}
              />
              <FieldError errors={[errors.taxNumber]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-vd">Vergi dairesi</FieldLabel>
              <Input id="customer-vd" {...form.register("taxOffice")} />
            </Field>
          </div>
          <FieldSet>
            <FieldLegend variant="label">İletişim kişileri</FieldLegend>
            {contacts.fields.map((contact, index) => {
              const contactErrors = errors.contacts?.[index]
              return (
                <div
                  key={contact.id}
                  className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2"
                >
                  <Field
                    data-invalid={Boolean(contactErrors?.name) || undefined}
                  >
                    <FieldLabel htmlFor={`contact-name-${index}`}>
                      Ad soyad
                    </FieldLabel>
                    <Input
                      id={`contact-name-${index}`}
                      {...form.register(`contacts.${index}.name`)}
                    />
                    <FieldError errors={[contactErrors?.name]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`contact-title-${index}`}>
                      Unvan
                    </FieldLabel>
                    <Input
                      id={`contact-title-${index}`}
                      {...form.register(`contacts.${index}.title`)}
                    />
                  </Field>
                  <Field
                    data-invalid={Boolean(contactErrors?.phone) || undefined}
                  >
                    <FieldLabel htmlFor={`contact-phone-${index}`}>
                      Telefon
                    </FieldLabel>
                    <Input
                      id={`contact-phone-${index}`}
                      type="tel"
                      {...form.register(`contacts.${index}.phone`)}
                    />
                    <FieldError errors={[contactErrors?.phone]} />
                  </Field>
                  <Field
                    data-invalid={Boolean(contactErrors?.email) || undefined}
                  >
                    <FieldLabel htmlFor={`contact-email-${index}`}>
                      E-posta
                    </FieldLabel>
                    <Input
                      id={`contact-email-${index}`}
                      type="email"
                      {...form.register(`contacts.${index}.email`)}
                    />
                    <FieldError errors={[contactErrors?.email]} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        contacts.remove(index)
                      }}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Kişiyi kaldır
                    </Button>
                  </div>
                </div>
              )
            })}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  contacts.append({
                    name: "",
                    title: "",
                    phone: "",
                    email: "",
                    isPrimary: contacts.fields.length === 0,
                  })
                }}
              >
                <PlusIcon data-icon="inline-start" />
                İletişim kişisi ekle
              </Button>
            </div>
          </FieldSet>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" form="customer-form" disabled={isSubmitting}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
