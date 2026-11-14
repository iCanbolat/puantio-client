import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useState } from "react"

import {
  CERTIFICATE_LABELS,
  CERTIFICATE_TYPES,
  type CertificateType,
} from "@/entities/location"
import type { TrainingRenewal, TrainingType } from "@/entities/ohs"
import { useCan } from "@/entities/session"
import {
  HAZARD_CLASSES,
  HAZARD_CLASS_LABELS,
  tenantKeys,
} from "@/entities/tenant"
import { ApiError } from "@/shared/api/errors"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { SimpleSelect } from "@/shared/components/simple-select"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Checkbox } from "@/shared/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Spinner } from "@/shared/ui/spinner"

import { ohsKeys, ohsQueries, updateOhsSettings } from "../api/ohs-api"
import { ohsSettingsSchema, type OhsSettings } from "../model/ohs"

const RENEWAL_KINDS = ["hazard_class", "months", "none"] as const
const RENEWAL_LABELS: Record<(typeof RENEWAL_KINDS)[number], string> = {
  hazard_class: "Tehlike sınıfına göre",
  months: "Sabit süre (ay)",
  none: "Yenilemesiz",
}

const numberOrNaN = (value: string) =>
  value === "" ? Number.NaN : Number(value)
export function OhsSettingsPage() {
  const query = useQuery(ohsQueries.settings())
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  return <SettingsForm initial={query.data} />
}

function SettingsForm({ initial }: { initial: OhsSettings }) {
  const canWrite = useCan("ohs:write")
  const queryClient = useQueryClient()
  const [values, setValues] = useState<OhsSettings>(initial)
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: updateOhsSettings,
    meta: {
      successMessage: "İSG ayarları kaydedildi",
      invalidates: [ohsKeys.all],
    },
    onSuccess: (saved) => {
      setValues(saved)
      void queryClient.invalidateQueries({ queryKey: tenantKeys.all })
    },
  })
  const rules = values.rules
  const setRules = (patch: Partial<OhsSettings["rules"]>) => {
    setValues({ ...values, rules: { ...rules, ...patch } })
  }
  const setTraining = (index: number, patch: Partial<TrainingType>) => {
    setValues({
      ...values,
      trainingTypes: values.trainingTypes.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    })
  }
  const setDocument = (
    index: number,
    patch: Partial<OhsSettings["documentTypes"][number]>
  ) => {
    setValues({
      ...values,
      documentTypes: values.documentTypes.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    })
  }
  const submit = () => {
    const parsed = ohsSettingsSchema.safeParse(values)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Formda hatalı alanlar var.")
      return
    }
    setError(null)
    mutation.mutate(parsed.data)
  }
  const serverError =
    mutation.error instanceof ApiError ? mutation.error.message : null
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="İSG ayarları"
        description="Tehlike sınıfı varsayılanı, eğitim yenileme süreleri, vardiya uygunluk politikası, eğitim türleri ve özlük belge kontrol listesi."
      />
      {error || serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{error ?? serverError}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!canWrite} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Kurallar</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ohs-default-hazard">
                Varsayılan tehlike sınıfı
              </FieldLabel>
              <SimpleSelect
                id="ohs-default-hazard"
                value={rules.defaultHazardClass}
                onChange={(defaultHazardClass) => {
                  setRules({ defaultHazardClass })
                }}
                options={HAZARD_CLASSES.map((value) => ({
                  value,
                  label: HAZARD_CLASS_LABELS[value],
                }))}
              />
              <FieldDescription>
                Lokasyonda sınıf seçilmemişse kullanılır.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ohs-policy">
                Sertifikası uygun olmayan personel vardiyaya atanınca
              </FieldLabel>
              <SimpleSelect
                id="ohs-policy"
                value={rules.certificatePolicy}
                onChange={(certificatePolicy) => {
                  setRules({ certificatePolicy })
                }}
                options={[
                  { value: "block", label: "Engelle (kayıt yapılamaz)" },
                  { value: "warn", label: "Uyar (kayıt yapılabilir)" },
                ]}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3 md:col-span-2">
              {HAZARD_CLASSES.map((hazard) => (
                <Field key={hazard}>
                  <FieldLabel htmlFor={`ohs-renewal-${hazard}`}>
                    {HAZARD_CLASS_LABELS[hazard]}: yenileme (yıl)
                  </FieldLabel>
                  <Input
                    id={`ohs-renewal-${hazard}`}
                    type="number"
                    inputMode="numeric"
                    value={
                      Number.isNaN(rules.renewalYears[hazard])
                        ? ""
                        : rules.renewalYears[hazard]
                    }
                    onChange={(event) => {
                      setRules({
                        renewalYears: {
                          ...rules.renewalYears,
                          [hazard]: numberOrNaN(event.target.value),
                        },
                      })
                    }}
                  />
                </Field>
              ))}
            </div>
            <Field>
              <FieldLabel htmlFor="ohs-warn-days">
                “Yakında doluyor” uyarısı (gün)
              </FieldLabel>
              <Input
                id="ohs-warn-days"
                type="number"
                inputMode="numeric"
                value={
                  Number.isNaN(rules.expiringWarnDays)
                    ? ""
                    : rules.expiringWarnDays
                }
                onChange={(event) => {
                  setRules({
                    expiringWarnDays: numberOrNaN(event.target.value),
                  })
                }}
              />
            </Field>
            <Field orientation="horizontal" className="items-start">
              <Checkbox
                id="ohs-include-health"
                checked={rules.includeHealthFitnessInAuditPack}
                onCheckedChange={(checked) => {
                  setRules({ includeHealthFitnessInAuditPack: checked })
                }}
              />
              <span className="flex flex-col gap-1">
                <Label htmlFor="ohs-include-health">
                  Denetim paketinde sağlık uygunluğunu göster
                </Label>
                <FieldDescription>
                  Yalnızca “Uygun” bilgisi; tarih, sonuç türü ve aşı bilgisi
                  hiçbir zaman pakete girmez. Personelin açık rızası alınmış
                  olmalıdır.
                </FieldDescription>
              </span>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eğitim türleri</CardTitle>
            <CardDescription>
              Sertifika gereksinimi seçilmeyen eğitim tüm personelde zorunludur.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {values.trainingTypes.map((type, index) => (
              <TrainingTypeRow
                key={type.id}
                type={type}
                onChange={(patch) => {
                  setTraining(index, patch)
                }}
              />
            ))}
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => {
                const id = `egitim-${String(values.trainingTypes.length + 1)}`
                setValues({
                  ...values,
                  trainingTypes: [
                    ...values.trainingTypes,
                    {
                      id,
                      name: "",
                      renewal: { kind: "months", months: 12 },
                      requiredFor: [],
                      isActive: true,
                    },
                  ],
                })
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Eğitim türü ekle
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Özlük belge kontrol listesi</CardTitle>
            <CardDescription>
              Tamamlanma yüzdesi zorunlu belgelerden hesaplanır. Geçerlilik
              süresi olan belge süre dolunca eksik sayılır.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {values.documentTypes.map((doc, index) => (
              <div
                key={doc.id}
                className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-[1fr_9rem_auto_auto]"
              >
                <Field>
                  <FieldLabel htmlFor={`doc-name-${doc.id}`}>Belge</FieldLabel>
                  <Input
                    id={`doc-name-${doc.id}`}
                    value={doc.name}
                    onChange={(event) => {
                      setDocument(index, { name: event.target.value })
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`doc-validity-${doc.id}`}>
                    Geçerlilik (ay)
                  </FieldLabel>
                  <Input
                    id={`doc-validity-${doc.id}`}
                    type="number"
                    inputMode="numeric"
                    placeholder="Süresiz"
                    value={doc.validityMonths ?? ""}
                    onChange={(event) => {
                      setDocument(index, {
                        validityMonths:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }}
                  />
                </Field>
                <span className="flex items-center gap-2 pb-2">
                  <Checkbox
                    id={`doc-required-${doc.id}`}
                    checked={doc.required}
                    onCheckedChange={(checked) => {
                      setDocument(index, { required: checked })
                    }}
                  />
                  <Label htmlFor={`doc-required-${doc.id}`}>Zorunlu</Label>
                </span>
                <span className="flex items-center gap-2 pb-2">
                  <Checkbox
                    id={`doc-active-${doc.id}`}
                    checked={doc.isActive}
                    onCheckedChange={(checked) => {
                      setDocument(index, { isActive: checked })
                    }}
                  />
                  <Label htmlFor={`doc-active-${doc.id}`}>Etkin</Label>
                </span>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => {
                setValues({
                  ...values,
                  documentTypes: [
                    ...values.documentTypes,
                    {
                      id: `belge-${String(values.documentTypes.length + 1)}`,
                      name: "",
                      required: false,
                      validityMonths: null,
                      isActive: true,
                    },
                  ],
                })
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Belge türü ekle
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sertifika geçerlilik süreleri</CardTitle>
            <CardDescription>
              Yeni sertifika kaydında bitiş tarihi bu süreden önerilir. Boş =
              süresiz.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CERTIFICATE_TYPES.map((type) => (
              <Field key={type}>
                <FieldLabel htmlFor={`cert-validity-${type}`}>
                  {CERTIFICATE_LABELS[type]} (ay)
                </FieldLabel>
                <Input
                  id={`cert-validity-${type}`}
                  type="number"
                  inputMode="numeric"
                  placeholder="Süresiz"
                  value={values.certificateValidityMonths[type] ?? ""}
                  onChange={(event) => {
                    setValues({
                      ...values,
                      certificateValidityMonths: {
                        ...values.certificateValidityMonths,
                        [type]:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      },
                    })
                  }}
                />
              </Field>
            ))}
          </CardContent>
        </Card>
      </fieldset>
      {canWrite ? (
        <div className="flex justify-end">
          <Button disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Kaydet
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function TrainingTypeRow({
  type,
  onChange,
}: {
  type: TrainingType
  onChange: (patch: Partial<TrainingType>) => void
}) {
  const setRenewal = (renewal: TrainingRenewal) => {
    onChange({ renewal })
  }
  const toggleCert = (cert: CertificateType, checked: boolean) => {
    onChange({
      requiredFor: checked
        ? [...type.requiredFor, cert]
        : type.requiredFor.filter((item) => item !== cert),
    })
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_14rem_8rem_auto]">
        <Field>
          <FieldLabel htmlFor={`training-name-${type.id}`}>
            Eğitim adı
          </FieldLabel>
          <Input
            id={`training-name-${type.id}`}
            value={type.name}
            onChange={(event) => {
              onChange({ name: event.target.value })
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`training-renewal-${type.id}`}>
            Yenileme
          </FieldLabel>
          <SimpleSelect
            id={`training-renewal-${type.id}`}
            value={type.renewal.kind}
            onChange={(kind) => {
              setRenewal(
                kind === "months"
                  ? { kind, months: 12 }
                  : kind === "hazard_class"
                    ? { kind }
                    : { kind: "none" }
              )
            }}
            options={RENEWAL_KINDS.map((value) => ({
              value,
              label: RENEWAL_LABELS[value],
            }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`training-months-${type.id}`}>Ay</FieldLabel>
          <Input
            id={`training-months-${type.id}`}
            type="number"
            inputMode="numeric"
            disabled={type.renewal.kind !== "months"}
            value={type.renewal.kind === "months" ? type.renewal.months : ""}
            onChange={(event) => {
              setRenewal({
                kind: "months",
                months: numberOrNaN(event.target.value),
              })
            }}
          />
        </Field>
        <span className="flex items-center gap-2 pb-2">
          <Checkbox
            id={`training-active-${type.id}`}
            checked={type.isActive}
            onCheckedChange={(checked) => {
              onChange({ isActive: checked })
            }}
          />
          <Label htmlFor={`training-active-${type.id}`}>Etkin</Label>
        </span>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-muted-foreground">
          Yalnızca bu sertifika gereksinimi olan lokasyonlarda zorunlu
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {CERTIFICATE_TYPES.map((cert) => {
            const id = `training-${type.id}-${cert}`
            return (
              <span key={cert} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={type.requiredFor.includes(cert)}
                  onCheckedChange={(checked) => {
                    toggleCert(cert, checked)
                  }}
                />
                <Label htmlFor={id} className="font-normal">
                  {CERTIFICATE_LABELS[cert]}
                </Label>
              </span>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}
