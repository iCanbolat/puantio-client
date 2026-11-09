import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  LockIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormReturn,
} from "react-hook-form"
import { useNavigate, useParams } from "react-router"

import { CUSTOMER_SECTORS, CUSTOMER_SECTOR_LABELS } from "@/entities/customer"
import { useCan } from "@/entities/session"
import { SERVICE_LINE_LABELS, useTenant } from "@/entities/tenant"
import { applyApiErrorToForm } from "@/shared/api/form-errors"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { formatDateTime } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Checkbox } from "@/shared/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import {
  createTemplate,
  qualityKeys,
  qualityQueries,
  updateTemplate,
} from "../api/quality-api"
import { isScored, totalWeight, validateTemplate } from "../domain/scoring"
import { toTemplateInput } from "../lib/format"
import {
  AUDIT_ITEM_TYPES,
  AUDIT_ITEM_TYPE_LABELS,
  auditTemplateInputSchema,
  type AuditItem,
  type AuditTemplate,
  type AuditTemplateInput,
} from "../model/audit"

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Acil" },
  { value: "high", label: "Yüksek" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Düşük" },
] as const

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

const blankItem = (): AuditItem => ({
  id: newId("m"),
  text: "",
  type: "yes_no",
  weight: 0,
  critical: false,
  workOrderPriority: "normal",
})

export function TemplateEditorPage() {
  const { templateId = "" } = useParams()
  const query = useQuery(qualityQueries.template(templateId))
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  return (
    <TemplateEditor
      key={`${query.data.id}-${String(query.data.version)}`}
      template={query.data}
    />
  )
}

function TemplateEditor({ template }: { template: AuditTemplate }) {
  const canWrite = useCan("quality:write")
  const tenant = useTenant()
  const navigate = useNavigate()
  const readOnly = template.builtIn || !canWrite
  const form = useForm<AuditTemplateInput>({
    resolver: zodResolver(auditTemplateInputSchema),
    defaultValues: toTemplateInput(template),
  })
  const sections = useFieldArray({
    control: form.control,
    name: "sections",
    keyName: "key",
  })
  const watched = useWatch({ control: form.control, name: "sections" })
  const total = totalWeight(watched)
  const weightsOk = total === 100

  const save = useMutation({
    mutationFn: (values: AuditTemplateInput) =>
      updateTemplate(template.id, values),
    meta: {
      successMessage: "Şablon kaydedildi",
      invalidates: [qualityKeys.all],
    },
  })
  const duplicate = useMutation({
    mutationFn: () =>
      createTemplate({
        ...toTemplateInput(template),
        name: `${template.name} (kopya)`,
      }),
    meta: {
      successMessage: "Şablon çoğaltıldı",
      invalidates: [qualityKeys.templates()],
    },
    onSuccess: (created) => {
      void navigate(paths.quality.template(created.id))
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const issues = validateTemplate(values)
    if (issues.length > 0) {
      for (const issue of issues) {
        if (issue.path === "_weights") continue
        form.setError(issue.path as "sections", {
          type: "rule",
          message: issue.message,
        })
      }
      return
    }
    try {
      await save.mutateAsync(values)
    } catch (error) {
      applyApiErrorToForm(error, form.setError)
    }
  })
  const { errors, isSubmitting, isDirty } = form.formState

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-col gap-6"
    >
      <PageHeader
        title={template.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              Sürüm {template.version} ·{" "}
              {SERVICE_LINE_LABELS[template.serviceLine]} ·{" "}
              {template.auditCount} denetim
            </span>
            {template.builtIn ? (
              <StatusBadge tone="info">
                <LockIcon className="size-3" aria-hidden />
                Hazır şablon
              </StatusBadge>
            ) : null}
            {!template.isActive ? (
              <StatusBadge tone="neutral">Pasif</StatusBadge>
            ) : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canWrite ? (
              <Button
                type="button"
                variant="outline"
                disabled={duplicate.isPending}
                onClick={() => {
                  duplicate.mutate()
                }}
              >
                <CopyIcon data-icon="inline-start" />
                Çoğalt
              </Button>
            ) : null}
            {!readOnly ? (
              <Button
                type="submit"
                disabled={!weightsOk || isSubmitting || !isDirty}
                aria-describedby="weight-total"
              >
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                Kaydet (yeni sürüm)
              </Button>
            ) : null}
          </div>
        }
      />
      {template.builtIn ? (
        <Alert>
          <AlertDescription>
            Platform kütüphanesindeki hazır şablonlar değiştirilemez. Firmanıza
            uyarlamak için çoğaltıp düzenleyin.
          </AlertDescription>
        </Alert>
      ) : null}
      {errors.root?.server?.message ? (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.server.message}</AlertDescription>
        </Alert>
      ) : null}

      <div
        id="weight-total"
        role="status"
        aria-live="polite"
        className={cn(
          "sticky top-14 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm backdrop-blur",
          weightsOk
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-amber-500/50 bg-amber-500/10"
        )}
      >
        <span className="font-medium">
          Ağırlık toplamı: <span className="tabular-nums">{total}</span> / 100
        </span>
        <span className="text-xs">
          {weightsOk
            ? "Toplam doğru."
            : `Kaydetmek için puanlı maddelerin ağırlık toplamı 100 olmalı (${total > 100 ? `${String(total - 100)} fazla` : `${String(100 - total)} eksik`}).`}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Genel</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={readOnly} className="contents">
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-2">
                <Field data-invalid={Boolean(errors.name) || undefined}>
                  <FieldLabel htmlFor="template-name">Şablon adı</FieldLabel>
                  <Input
                    id="template-name"
                    aria-invalid={Boolean(errors.name)}
                    {...form.register("name")}
                  />
                  <FieldError errors={[errors.name]} />
                </Field>
                <Controller
                  control={form.control}
                  name="serviceLine"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="template-service">
                        Hizmet hattı
                      </FieldLabel>
                      <SimpleSelect
                        id="template-service"
                        disabled={readOnly}
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
              <Field>
                <FieldLabel htmlFor="template-description">Açıklama</FieldLabel>
                <Textarea
                  id="template-description"
                  rows={2}
                  {...form.register("description", {
                    setValueAs: (value: string | null) =>
                      value?.trim() ? value : null,
                  })}
                />
              </Field>
              <Controller
                control={form.control}
                name="sectors"
                render={({ field }) => (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm font-medium">
                      Müşteri sektörleri (boşsa tümü)
                    </legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CUSTOMER_SECTORS.map((sector) => {
                        const id = `sector-${sector}`
                        return (
                          <div key={sector} className="flex items-center gap-2">
                            <Checkbox
                              id={id}
                              disabled={readOnly}
                              checked={field.value.includes(sector)}
                              onCheckedChange={(checked) => {
                                field.onChange(
                                  checked
                                    ? [...field.value, sector]
                                    : field.value.filter(
                                        (item) => item !== sector
                                      )
                                )
                              }}
                            />
                            <Label htmlFor={id} className="font-normal">
                              {CUSTOMER_SECTOR_LABELS[sector]}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                  </fieldset>
                )}
              />
              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="template-active"
                      disabled={readOnly}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="template-active" className="font-normal">
                      Etkin (yeni denetim planlarında seçilebilir)
                    </Label>
                  </div>
                )}
              />
            </FieldGroup>
          </fieldset>
        </CardContent>
      </Card>

      {sections.fields.map((section, sectionIndex) => (
        <SectionCard
          key={section.key}
          form={form}
          control={form.control}
          sectionIndex={sectionIndex}
          sectionCount={sections.fields.length}
          readOnly={readOnly}
          onMove={(delta) => {
            sections.move(sectionIndex, sectionIndex + delta)
          }}
          onRemove={() => {
            sections.remove(sectionIndex)
          }}
        />
      ))}
      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => {
            sections.append({ id: newId("s"), title: "", items: [blankItem()] })
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Bölüm ekle
        </Button>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Sürümler</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm">
            {[...template.versions].reverse().map((version) => (
              <li
                key={version.number}
                className="flex flex-wrap justify-between gap-2"
              >
                <span className="font-medium">Sürüm {version.number}</span>
                <span className="text-muted-foreground">
                  {version.itemCount} madde · {version.publishedBy} ·{" "}
                  {formatDateTime(version.publishedAt)}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Maddeler değiştiğinde yeni sürüm yayımlanır; geçmiş denetimler kendi
            sürümüyle puanlanmış olarak kalır.
          </p>
        </CardContent>
      </Card>
    </form>
  )
}

function SectionCard({
  form,
  control,
  sectionIndex,
  sectionCount,
  readOnly,
  onMove,
  onRemove,
}: {
  form: UseFormReturn<AuditTemplateInput>
  control: Control<AuditTemplateInput>
  sectionIndex: number
  sectionCount: number
  readOnly: boolean
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const items = useFieldArray({
    control,
    name: `sections.${sectionIndex}.items`,
    keyName: "key",
  })
  const sectionErrors = form.formState.errors.sections?.[sectionIndex]
  const titleId = `section-${String(sectionIndex)}-title`
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-end gap-3">
        <Field
          className="min-w-56 flex-1"
          data-invalid={Boolean(sectionErrors?.title) || undefined}
        >
          <FieldLabel htmlFor={titleId}>Bölüm {sectionIndex + 1}</FieldLabel>
          <Input
            id={titleId}
            disabled={readOnly}
            aria-invalid={Boolean(sectionErrors?.title)}
            {...form.register(`sections.${sectionIndex}.title`)}
          />
          <FieldError errors={[sectionErrors?.title]} />
        </Field>
        {!readOnly ? (
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Bölüm ${String(sectionIndex + 1)} yukarı taşı`}
              disabled={sectionIndex === 0}
              onClick={() => {
                onMove(-1)
              }}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Bölüm ${String(sectionIndex + 1)} aşağı taşı`}
              disabled={sectionIndex === sectionCount - 1}
              onClick={() => {
                onMove(1)
              }}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Bölüm ${String(sectionIndex + 1)} sil`}
              disabled={sectionCount === 1}
              onClick={onRemove}
            >
              <Trash2Icon />
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(sectionErrors?.items?.root?.message ??
        sectionErrors?.items?.message) ? (
          <p className="text-sm text-red-700 dark:text-red-400">
            {sectionErrors.items.root?.message ?? sectionErrors.items.message}
          </p>
        ) : null}
        <ol className="flex flex-col gap-3">
          {items.fields.map((item, itemIndex) => (
            <ItemRow
              key={item.key}
              form={form}
              sectionIndex={sectionIndex}
              itemIndex={itemIndex}
              itemCount={items.fields.length}
              readOnly={readOnly}
              onMove={(delta) => {
                items.move(itemIndex, itemIndex + delta)
              }}
              onRemove={() => {
                items.remove(itemIndex)
              }}
            />
          ))}
        </ol>
        {!readOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              items.append(blankItem())
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Madde ekle
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ItemRow({
  form,
  sectionIndex,
  itemIndex,
  itemCount,
  readOnly,
  onMove,
  onRemove,
}: {
  form: UseFormReturn<AuditTemplateInput>
  sectionIndex: number
  itemIndex: number
  itemCount: number
  readOnly: boolean
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const base = `sections.${sectionIndex}.items.${itemIndex}` as const
  const type = useWatch({ control: form.control, name: `${base}.type` })
  const critical = useWatch({ control: form.control, name: `${base}.critical` })
  const errors =
    form.formState.errors.sections?.[sectionIndex]?.items?.[itemIndex]
  const id = (field: string) =>
    `item-${String(sectionIndex)}-${String(itemIndex)}-${field}`
  const label = `Madde ${String(sectionIndex + 1)}.${String(itemIndex + 1)}`
  const scored = isScored({ type })
  return (
    <li className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_10rem_6rem_auto]">
      <Field data-invalid={Boolean(errors?.text) || undefined}>
        <FieldLabel htmlFor={id("text")}>{label}</FieldLabel>
        <Input
          id={id("text")}
          disabled={readOnly}
          aria-invalid={Boolean(errors?.text)}
          {...form.register(`${base}.text`)}
        />
        <FieldError errors={[errors?.text]} />
      </Field>
      <Controller
        control={form.control}
        name={`${base}.type`}
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={id("type")}>
              <span className="sr-only">{label} </span>
              Tip
            </FieldLabel>
            <SimpleSelect
              id={id("type")}
              aria-label={`${label} Tip`}
              disabled={readOnly}
              value={field.value}
              onChange={(value) => {
                field.onChange(value)
                if (value === "note") {
                  form.setValue(`${base}.weight`, 0, { shouldDirty: true })
                  form.setValue(`${base}.critical`, false, {
                    shouldDirty: true,
                  })
                }
              }}
              options={AUDIT_ITEM_TYPES.map((value) => ({
                value,
                label: AUDIT_ITEM_TYPE_LABELS[value],
              }))}
            />
          </Field>
        )}
      />
      <Field data-invalid={Boolean(errors?.weight) || undefined}>
        <FieldLabel htmlFor={id("weight")}>
          <span className="sr-only">{label} </span>
          Ağırlık
        </FieldLabel>
        <Input
          id={id("weight")}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          disabled={readOnly || !scored}
          aria-invalid={Boolean(errors?.weight)}
          {...form.register(`${base}.weight`, { valueAsNumber: true })}
        />
        <FieldError errors={[errors?.weight]} />
      </Field>
      {!readOnly ? (
        <div className="flex items-end gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`${label} yukarı taşı`}
            disabled={itemIndex === 0}
            onClick={() => {
              onMove(-1)
            }}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`${label} aşağı taşı`}
            disabled={itemIndex === itemCount - 1}
            onClick={() => {
              onMove(1)
            }}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`${label} sil`}
            disabled={itemCount === 1}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 md:col-span-4">
        <Controller
          control={form.control}
          name={`${base}.critical`}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                id={id("critical")}
                disabled={readOnly || !scored}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor={id("critical")} className="font-normal">
                Kritik madde (başarısızsa otomatik iş emri)
              </Label>
            </div>
          )}
        />
        {critical ? (
          <Controller
            control={form.control}
            name={`${base}.workOrderPriority`}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Label htmlFor={id("priority")} className="font-normal">
                  İş emri önceliği
                </Label>
                <SimpleSelect
                  id={id("priority")}
                  className="w-32"
                  disabled={readOnly}
                  value={field.value}
                  onChange={field.onChange}
                  options={PRIORITY_OPTIONS}
                />
              </div>
            )}
          />
        ) : null}
        {errors?.critical?.message ? (
          <span className="text-sm text-red-700 dark:text-red-400">
            {errors.critical.message}
          </span>
        ) : null}
      </div>
    </li>
  )
}
