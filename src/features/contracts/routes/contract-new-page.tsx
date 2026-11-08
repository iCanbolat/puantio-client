import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { useNavigate } from "react-router"

import {
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  contractKeys,
} from "@/entities/contract"
import { CustomerCombobox } from "@/entities/customer"
import { legalEntityQueries } from "@/entities/legal-entity"
import { POSITION_LABELS } from "@/entities/personnel"
import { SERVICE_LINE_LABELS } from "@/entities/tenant"
import { ApiError } from "@/shared/api/errors"
import { DetailList } from "@/shared/components/detail-list"
import { PageHeader } from "@/shared/components/page-header"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StepIndicator } from "@/shared/components/step-indicator"
import { paths } from "@/shared/config/paths"
import { formatDate, formatMoney } from "@/shared/lib/format"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"

import { contractDetailQueries, createContract } from "../api/contracts-api"
import {
  CommitmentsEditor,
  LocationPicker,
  PricesEditor,
  RulesEditor,
  ScopeEditor,
  type ErrorMap,
} from "../components/body-editors"
import { totalHeadcount } from "../domain/commitments"
import {
  bodyErrors,
  emptyBody,
  normalizeBody,
  sectionOf,
  serverBodyErrors,
  type BodySection,
} from "../lib/body-form"
import {
  COVERAGE_LABELS,
  contractGeneralSchema,
  type ContractGeneral,
  type VersionBody,
} from "../model/contract"

type Step = "general" | BodySection | "summary"

const STEPS: { id: Step; label: string }[] = [
  { id: "general", label: "Genel" },
  { id: "scope", label: "Hizmet kapsamı" },
  { id: "locations", label: "Lokasyonlar" },
  { id: "commitments", label: "Taahhüt kadro" },
  { id: "prices", label: "Birim fiyatlar" },
  { id: "rules", label: "Kurallar" },
  { id: "summary", label: "Özet" },
]

const stepAt = (index: number): (typeof STEPS)[number] =>
  STEPS[Math.min(Math.max(index, 0), STEPS.length - 1)] ?? {
    id: "general",
    label: "Genel",
  }

/** Lokasyonun hedef kadrosu taahhüt önerisi olarak gelir (0 ise boş bırakılır) */
const suggestion = (target: number | undefined) =>
  target !== undefined && target > 0 ? target : Number.NaN

const GENERAL_FIELDS = [
  "title",
  "customerId",
  "contractorLegalEntityId",
  "type",
  "ikn",
  "startDate",
  "endDate",
] as const

export function ContractNewPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>("general")
  const [body, setBody] = useState<VersionBody>(() => emptyBody())
  const [errors, setErrors] = useState<ErrorMap>({})
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [customerLabel, setCustomerLabel] = useState<string | null>(null)
  const templates = useQuery(contractDetailQueries.templates())
  const legalEntities = useQuery(legalEntityQueries.list())

  const form = useForm<ContractGeneral>({
    resolver: zodResolver(contractGeneralSchema),
    defaultValues: {
      title: "",
      customerId: "",
      contractorLegalEntityId: "",
      type: "private",
      ikn: "",
      startDate: "",
      endDate: "",
      templateId: null,
    },
  })
  const general = useWatch({ control: form.control })
  const mutation = useMutation({
    mutationFn: createContract,
    meta: {
      successMessage: "Sözleşme oluşturuldu",
      invalidates: [contractKeys.all],
    },
  })

  const index = STEPS.findIndex((item) => item.id === step)
  const go = (next: Step) => {
    setErrors({})
    setStep(next)
  }
  const patch = (value: Partial<VersionBody>) => {
    setBody((current) => ({ ...current, ...value }))
  }

  const applyTemplate = (templateId: string | null) => {
    const template = templates.data?.find((item) => item.id === templateId)
    if (!template) return
    patch({ rules: structuredClone(template.rules) })
    form.setValue("type", template.contractType)
  }

  const next = async () => {
    if (step === "general") {
      const valid = await form.trigger()
      if (!valid) return
      const start = form.getValues("startDate")
      patch({
        locations: body.locations.map((location) => ({
          ...location,
          from: start,
        })),
      })
      go("scope")
      return
    }
    if (step === "summary") return
    const found = bodyErrors(body, [step])
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const following = stepAt(index + 1).id
    if (following === "commitments") {
      const covered = new Set(body.commitments.map((item) => item.locationId))
      patch({
        commitments: [
          ...body.commitments.filter((item) =>
            body.locations.some(
              (location) => location.locationId === item.locationId
            )
          ),
          ...body.locations
            .filter((location) => !covered.has(location.locationId))
            .map((location) => ({
              locationId: location.locationId,
              position: "cleaning_staff" as const,
              headcount: suggestion(targets[location.locationId]),
              coverage: "six_days" as const,
            })),
        ],
      })
    }
    go(following)
  }

  const submit = async () => {
    const all = bodyErrors(body)
    if (Object.keys(all).length > 0) {
      setErrors(all)
      const first = Object.keys(all).map(sectionOf).find(Boolean)
      if (first) setStep(first)
      return
    }
    try {
      const contract = await mutation.mutateAsync({
        general: form.getValues(),
        body: normalizeBody(body),
      })
      void navigate(paths.contracts.detail(contract.id))
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 422) return
      const fieldErrors = error.fieldErrors ?? {}
      let generalError = false
      for (const name of GENERAL_FIELDS) {
        const message = fieldErrors[`general.${name}`]?.[0]
        if (message) {
          form.setError(name, { message })
          generalError = true
        }
      }
      if (generalError) {
        setStep("general")
        return
      }
      const mapped = serverBodyErrors(fieldErrors)
      setErrors(mapped)
      const first = Object.keys(mapped).map(sectionOf).find(Boolean)
      if (first) setStep(first)
    }
  }

  const { errors: formErrors } = form.formState
  const customerId = general.customerId ?? ""
  const entityTitle = legalEntities.data?.find(
    (item) => item.id === general.contractorLegalEntityId
  )?.title

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Yeni sözleşme"
        description="Müşteri, kapsam, lokasyon × pozisyon taahhüt kadro, birim fiyat ve hakediş kuralları."
      />
      <StepIndicator
        steps={STEPS}
        current={step}
        label="Sözleşme adımları"
        onSelect={go}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{stepAt(index).label}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {step === "general" ? (
            <FieldGroup>
              <Field data-invalid={Boolean(formErrors.title) || undefined}>
                <FieldLabel htmlFor="contract-title">Sözleşme adı</FieldLabel>
                <Input
                  id="contract-title"
                  aria-invalid={Boolean(formErrors.title)}
                  {...form.register("title")}
                />
                <FieldError errors={[formErrors.title]} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  data-invalid={Boolean(formErrors.customerId) || undefined}
                >
                  <FieldLabel>Müşteri</FieldLabel>
                  <Controller
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <CustomerCombobox
                        value={field.value || null}
                        {...(customerLabel
                          ? { selectedLabel: customerLabel }
                          : {})}
                        onValueChange={(value, label) => {
                          field.onChange(value ?? "")
                          setCustomerLabel(label)
                          if (value !== field.value)
                            patch({ locations: [], commitments: [] })
                        }}
                      />
                    )}
                  />
                  <FieldError errors={[formErrors.customerId]} />
                </Field>
                <Field
                  data-invalid={
                    Boolean(formErrors.contractorLegalEntityId) || undefined
                  }
                >
                  <FieldLabel htmlFor="contract-entity">
                    Yüklenici tüzel kişilik
                  </FieldLabel>
                  <Controller
                    control={form.control}
                    name="contractorLegalEntityId"
                    render={({ field }) => (
                      <SimpleSelect
                        id="contract-entity"
                        value={field.value || null}
                        invalid={Boolean(formErrors.contractorLegalEntityId)}
                        options={(legalEntities.data ?? []).map((item) => ({
                          value: item.id,
                          label: item.title,
                        }))}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <FieldError errors={[formErrors.contractorLegalEntityId]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="contract-template">
                    Sözleşme şablonu
                  </FieldLabel>
                  <Controller
                    control={form.control}
                    name="templateId"
                    render={({ field }) => (
                      <SimpleSelect
                        id="contract-template"
                        value={field.value}
                        placeholder="Şablon seçin (kurallar kopyalanır)"
                        options={(templates.data ?? []).map((item) => ({
                          value: item.id,
                          label: item.name,
                        }))}
                        onChange={(value) => {
                          field.onChange(value)
                          applyTemplate(value)
                        }}
                      />
                    )}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="contract-type">Sözleşme tipi</FieldLabel>
                  <Controller
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <SimpleSelect
                        id="contract-type"
                        value={field.value}
                        options={CONTRACT_TYPES.map((type) => ({
                          value: type,
                          label: CONTRACT_TYPE_LABELS[type],
                        }))}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Field>
                <Field data-invalid={Boolean(formErrors.ikn) || undefined}>
                  <FieldLabel htmlFor="contract-ikn">
                    İhale kayıt numarası (İKN)
                  </FieldLabel>
                  <Input
                    id="contract-ikn"
                    placeholder="2026/123456"
                    aria-invalid={Boolean(formErrors.ikn)}
                    {...form.register("ikn")}
                  />
                  <FieldError errors={[formErrors.ikn]} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    data-invalid={Boolean(formErrors.startDate) || undefined}
                  >
                    <FieldLabel htmlFor="contract-start">Başlangıç</FieldLabel>
                    <Input
                      id="contract-start"
                      type="date"
                      aria-invalid={Boolean(formErrors.startDate)}
                      {...form.register("startDate")}
                    />
                    <FieldError errors={[formErrors.startDate]} />
                  </Field>
                  <Field
                    data-invalid={Boolean(formErrors.endDate) || undefined}
                  >
                    <FieldLabel htmlFor="contract-end">Bitiş</FieldLabel>
                    <Input
                      id="contract-end"
                      type="date"
                      aria-invalid={Boolean(formErrors.endDate)}
                      {...form.register("endDate")}
                    />
                    <FieldError errors={[formErrors.endDate]} />
                  </Field>
                </div>
              </div>
            </FieldGroup>
          ) : null}
          {step === "scope" ? (
            <ScopeEditor
              serviceLines={body.serviceLines}
              scopeItems={body.scopeItems}
              errors={errors}
              onChange={patch}
            />
          ) : null}
          {step === "locations" ? (
            <LocationPicker
              customerId={customerId}
              locations={body.locations}
              defaultFrom={general.startDate ?? ""}
              errors={errors}
              onChange={(locations, picked) => {
                patch({ locations })
                if (picked) setTargets((current) => ({ ...current, ...picked }))
              }}
            />
          ) : null}
          {step === "commitments" ? (
            <CommitmentsEditor
              locations={body.locations}
              commitments={body.commitments}
              errors={errors}
              onChange={(commitments) => {
                patch({ commitments })
              }}
            />
          ) : null}
          {step === "prices" ? (
            <PricesEditor
              commitments={body.commitments}
              prices={body.prices}
              errors={errors}
              onChange={(prices) => {
                patch({ prices })
              }}
            />
          ) : null}
          {step === "rules" ? (
            <RulesEditor
              rules={body.rules}
              errors={errors}
              onChange={(rules) => {
                patch({ rules })
              }}
            />
          ) : null}
          {step === "summary" ? (
            <div className="flex flex-col gap-6">
              {mutation.error &&
              !(
                mutation.error instanceof ApiError &&
                mutation.error.status === 422
              ) ? (
                <Alert variant="destructive">
                  <AlertDescription>{mutation.error.message}</AlertDescription>
                </Alert>
              ) : null}
              <DetailList
                items={[
                  { label: "Sözleşme", value: general.title },
                  { label: "Müşteri", value: customerLabel },
                  { label: "Yüklenici", value: entityTitle },
                  {
                    label: "Tip",
                    value: general.type
                      ? CONTRACT_TYPE_LABELS[general.type]
                      : null,
                  },
                  {
                    label: "Dönem",
                    value:
                      general.startDate && general.endDate
                        ? `${formatDate(general.startDate)} – ${formatDate(general.endDate)}`
                        : null,
                  },
                  {
                    label: "Hizmet hatları",
                    value: body.serviceLines
                      .map((line) => SERVICE_LINE_LABELS[line])
                      .join(", "),
                  },
                  {
                    label: "Lokasyon",
                    value: `${body.locations.length} lokasyon`,
                  },
                  {
                    label: "Taahhüt kadro",
                    value: `${totalHeadcount(body.commitments)} kişi`,
                  },
                ]}
              />
              <ul
                className="flex flex-col gap-1 text-sm"
                aria-label="Taahhüt özeti"
              >
                {body.commitments.map((item, i) => {
                  const location = body.locations.find(
                    (entry) => entry.locationId === item.locationId
                  )
                  const price = body.prices.unitPrices.find(
                    (entry) => entry.position === item.position
                  )
                  return (
                    <li key={i}>
                      {location?.locationName} ·{" "}
                      {POSITION_LABELS[item.position]} · {item.headcount} kişi ·{" "}
                      {COVERAGE_LABELS[item.coverage]}
                      {price ? ` · ${formatMoney(price.monthly)}/kişi-ay` : ""}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={index === 0}
          onClick={() => {
            go(stepAt(index - 1).id)
          }}
        >
          Geri
        </Button>
        {step === "summary" ? (
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => void submit()}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Sözleşmeyi kaydet
          </Button>
        ) : (
          <Button type="button" onClick={() => void next()}>
            İleri
          </Button>
        )}
      </div>
    </div>
  )
}
