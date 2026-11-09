import { useMutation, useQuery } from "@tanstack/react-query"
import { CheckCircle2Icon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { workOrderKeys, customerRequestSchema } from "@/features/work-orders"
import { AREA_TYPE_LABELS } from "@/entities/location"
import { useTerms } from "@/entities/tenant"
import { ApiError } from "@/shared/api/errors"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { SimpleSelect } from "@/shared/components/simple-select"
import { paths } from "@/shared/config/paths"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import {
  createCustomerRequest,
  portalKeys,
  portalQueries,
} from "../api/portal-api"
import { issuesForSelection } from "../domain/request"
import type { RequestOptions } from "../model/portal"

const NO_AREA = "__none__"

export function PortalRequestPage() {
  const query = useQuery(portalQueries.requestOptions())
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  return <RequestForm options={query.data} />
}

function RequestForm({ options }: { options: RequestOptions }) {
  const terms = useTerms()
  const [locationId, setLocationId] = useState(
    options.locations.length === 1 ? (options.locations[0]?.id ?? "") : ""
  )
  const [areaId, setAreaId] = useState<string | null>(null)
  const [categoryCode, setCategoryCode] = useState("")
  const [note, setNote] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: createCustomerRequest,
    meta: { invalidates: [workOrderKeys.all, portalKeys.summary()] },
  })
  const location = options.locations.find((item) => item.id === locationId)
  const issues = issuesForSelection(options, locationId, areaId)

  if (mutation.data)
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2Icon className="size-10 text-emerald-600" aria-hidden />
          <h1 className="font-heading text-xl font-semibold">
            Talebiniz alındı
          </h1>
          <p className="text-sm text-muted-foreground">
            {mutation.data.merged
              ? `Aynı sorun için açık bir iş emri vardı; talebiniz ${mutation.data.number} numaralı kayda eklendi.`
              : `${mutation.data.number} numaralı iş emri açıldı. Durumunu iş emirleri sayfasından izleyebilirsiniz.`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              to={paths.portal.workOrder(mutation.data.workOrderId)}
              className={buttonVariants()}
            >
              İş emrini aç
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                mutation.reset()
                setCategoryCode("")
                setNote("")
              }}
            >
              Yeni talep
            </Button>
          </div>
        </CardContent>
      </Card>
    )

  const submit = () => {
    const parsed = customerRequestSchema.safeParse({
      locationId,
      areaId,
      categoryCode,
      note: note.trim() || null,
    })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      return
    }
    setErrors({})
    mutation.mutate(parsed.data)
  }
  const serverError =
    mutation.error instanceof ApiError ? mutation.error.message : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Talep aç"
        description="Hizmet ekibimize iletilir ve önceliğine göre SLA süresi içinde ele alınır."
      />
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            {serverError ? (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={Boolean(errors.locationId) || undefined}>
              <FieldLabel htmlFor="request-location">
                {terms.location.singular}
              </FieldLabel>
              <SimpleSelect
                id="request-location"
                invalid={Boolean(errors.locationId)}
                value={locationId || null}
                onChange={(value) => {
                  setLocationId(value)
                  setAreaId(null)
                  setCategoryCode("")
                }}
                options={options.locations.map((item) => ({
                  value: item.id,
                  label: `${item.name} (${item.code})`,
                }))}
              />
              {errors.locationId ? (
                <FieldError>{errors.locationId}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="request-area">
                {terms.area.singular} (isteğe bağlı)
              </FieldLabel>
              <SimpleSelect
                id="request-area"
                disabled={!location}
                value={areaId ?? NO_AREA}
                onChange={(value) => {
                  setAreaId(value === NO_AREA ? null : value)
                  setCategoryCode("")
                }}
                options={[
                  {
                    value: NO_AREA,
                    label: `Belirli bir ${terms.lower(terms.area)} değil`,
                  },
                  ...(location?.areas ?? []).map((area) => ({
                    value: area.id,
                    label: `${area.name} · ${AREA_TYPE_LABELS[area.type]}`,
                  })),
                ]}
              />
            </Field>
            <fieldset
              className="flex flex-col gap-2"
              data-invalid={Boolean(errors.categoryCode) || undefined}
              disabled={!location}
            >
              <legend className="mb-2 text-sm font-medium">Sorun</legend>
              {location ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {issues.map((issue) => (
                    <Button
                      key={issue.code}
                      type="button"
                      variant={
                        categoryCode === issue.code ? "default" : "outline"
                      }
                      aria-pressed={categoryCode === issue.code}
                      className="h-auto min-h-11 justify-start text-left whitespace-normal"
                      onClick={() => {
                        setCategoryCode(issue.code)
                      }}
                    >
                      {issue.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Önce {terms.lower(terms.location)} seçin.
                </p>
              )}
              {errors.categoryCode ? (
                <FieldError>{errors.categoryCode}</FieldError>
              ) : null}
            </fieldset>
            <Field data-invalid={Boolean(errors.note) || undefined}>
              <FieldLabel htmlFor="request-note">
                Açıklama (isteğe bağlı)
              </FieldLabel>
              <Textarea
                id="request-note"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value)
                }}
              />
              {errors.note ? <FieldError>{errors.note}</FieldError> : null}
            </Field>
            <Button
              className="self-start"
              disabled={mutation.isPending}
              onClick={submit}
            >
              {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              Talebi gönder
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  )
}
