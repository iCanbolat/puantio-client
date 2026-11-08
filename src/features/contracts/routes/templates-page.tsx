import { useMutation, useQuery } from "@tanstack/react-query"
import { CopyIcon, PencilIcon } from "lucide-react"
import { useState } from "react"

import {
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  contractKeys,
} from "@/entities/contract"
import { Can } from "@/entities/session"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatMoney } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import {
  contractDetailQueries,
  createTemplate,
  updateTemplate,
} from "../api/contracts-api"
import { RulesEditor, type ErrorMap } from "../components/body-editors"
import { rulesErrors } from "../lib/body-form"
import {
  PRICE_ADJUSTMENT_LABELS,
  type ContractTemplate,
  type ContractTemplateInput,
} from "../model/contract"

export function ContractTemplatesPage() {
  const query = useQuery(contractDetailQueries.templates())
  const [editing, setEditing] = useState<ContractTemplate | null>(null)
  const duplicate = useMutation({
    mutationFn: (template: ContractTemplate) =>
      createTemplate({
        name: `${template.name} (kopya)`,
        description: template.description,
        contractType: template.contractType,
        rules: template.rules,
      }),
    meta: {
      successMessage: "Şablon çoğaltıldı",
      invalidates: [contractKeys.templates()],
    },
  })

  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sözleşme şablonları"
        description="Hakediş kural setleri: eksik personel kesintisi ve cezası, fiyat farkı, KDV ve ceza maddeleri. Yeni sözleşme şablondaki kuralları kopyalar."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {query.data.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle>
                <h2 className="flex flex-wrap items-center gap-2">
                  {template.name}
                  {template.builtIn ? (
                    <StatusBadge tone="neutral">Hazır şablon</StatusBadge>
                  ) : null}
                </h2>
              </CardTitle>
              <CardDescription>{template.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Tip</dt>
                <dd>{CONTRACT_TYPE_LABELS[template.contractType]}</dd>
                <dt className="text-muted-foreground">Eksik personel</dt>
                <dd>
                  %{template.rules.shortfallDeductionPercent}
                  {template.rules.shortfallPenaltyPerPersonDay > 0
                    ? ` + ${formatMoney(template.rules.shortfallPenaltyPerPersonDay)}/kişi-gün`
                    : ""}
                </dd>
                <dt className="text-muted-foreground">Fiyat farkı</dt>
                <dd>
                  {PRICE_ADJUSTMENT_LABELS[template.rules.priceAdjustment.kind]}
                </dd>
                <dt className="text-muted-foreground">KDV</dt>
                <dd>%{template.rules.vatRate}</dd>
              </dl>
            </CardContent>
            <Can permission="contract:write">
              <CardFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={duplicate.isPending}
                  onClick={() => {
                    duplicate.mutate(template)
                  }}
                >
                  <CopyIcon data-icon="inline-start" />
                  Çoğalt
                </Button>
                {template.builtIn ? null : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(template)
                    }}
                  >
                    <PencilIcon data-icon="inline-start" />
                    Düzenle
                  </Button>
                )}
              </CardFooter>
            </Can>
          </Card>
        ))}
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          {editing ? (
            <TemplateForm
              key={editing.id}
              template={editing}
              onDone={() => {
                setEditing(null)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplateForm({
  template,
  onDone,
}: {
  template: ContractTemplate
  onDone: () => void
}) {
  const [value, setValue] = useState<ContractTemplateInput>({
    name: template.name,
    description: template.description,
    contractType: template.contractType,
    rules: structuredClone(template.rules),
  })
  const [errors, setErrors] = useState<ErrorMap>({})
  const mutation = useMutation({
    mutationFn: (input: ContractTemplateInput) =>
      updateTemplate(template.id, input),
    meta: {
      successMessage: "Şablon kaydedildi",
      invalidates: [contractKeys.templates()],
    },
  })
  const submit = async () => {
    const found: Record<string, string> = { ...rulesErrors(value.rules) }
    if (value.name.trim().length < 3) found.name = "Şablon adını girin"
    setErrors(found)
    if (Object.keys(found).length > 0) return
    await mutation.mutateAsync(value)
    onDone()
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Şablonu düzenle</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name) || undefined}>
          <FieldLabel htmlFor="template-name">Şablon adı</FieldLabel>
          <Input
            id="template-name"
            value={value.name}
            aria-invalid={Boolean(errors.name)}
            onChange={(event) => {
              setValue({ ...value, name: event.target.value })
            }}
          />
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="template-description">Açıklama</FieldLabel>
          <Textarea
            id="template-description"
            rows={2}
            value={value.description}
            onChange={(event) => {
              setValue({ ...value, description: event.target.value })
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="template-type">Sözleşme tipi</FieldLabel>
          <SimpleSelect
            id="template-type"
            value={value.contractType}
            options={CONTRACT_TYPES.map((type) => ({
              value: type,
              label: CONTRACT_TYPE_LABELS[type],
            }))}
            onChange={(contractType) => {
              setValue({ ...value, contractType })
            }}
          />
        </Field>
        <RulesEditor
          rules={value.rules}
          errors={errors}
          onChange={(rules) => {
            setValue({ ...value, rules })
          }}
        />
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button disabled={mutation.isPending} onClick={() => void submit()}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
