import { useMutation, useQuery } from "@tanstack/react-query"
import { PlusIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"

import { useCan } from "@/entities/session"
import { ApiError } from "@/shared/api/errors"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { SimpleSelect } from "@/shared/components/simple-select"
import { formatDateTime } from "@/shared/lib/format"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Checkbox } from "@/shared/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Spinner } from "@/shared/ui/spinner"

import {
  portalKeys,
  portalQueries,
  updateSubscription,
} from "../api/portal-api"
import {
  REPORT_FREQUENCIES,
  REPORT_FREQUENCY_LABELS,
  REPORT_SECTIONS,
  REPORT_SECTION_LABELS,
  reportSubscriptionInputSchema,
  type ReportSubscription,
} from "../model/portal"

/** Otomatik rapor gönderimi: alıcılar ve sıklık. Gönderimi backend yapar. */
export function PortalReportSettingsPage() {
  const query = useQuery(portalQueries.subscription())
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  return (
    <SettingsForm
      key={query.data.updatedAt ?? "new"}
      subscription={query.data}
    />
  )
}

function SettingsForm({ subscription }: { subscription: ReportSubscription }) {
  const canEdit = useCan("portal:report_settings")
  const [recipients, setRecipients] = useState(subscription.recipients)
  const [draft, setDraft] = useState("")
  const [frequency, setFrequency] = useState(subscription.frequency)
  const [sections, setSections] = useState(subscription.includeSections)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: updateSubscription,
    meta: {
      successMessage: "Gönderim ayarları kaydedildi",
      invalidates: [portalKeys.subscription()],
    },
  })
  const addRecipient = () => {
    // E-posta adresi Türkçe locale ile küçültülmez ("I" → "ı" olur)
    const email = draft.trim().toLowerCase()
    if (!z.email().safeParse(email).success) {
      setErrors({ draft: "Geçerli bir e-posta girin" })
      return
    }
    if (recipients.includes(email)) {
      setErrors({ draft: "Bu alıcı zaten ekli" })
      return
    }
    setRecipients([...recipients, email])
    setDraft("")
    setErrors({})
  }
  const submit = () => {
    const parsed = reportSubscriptionInputSchema.safeParse({
      recipients,
      frequency,
      includeSections: sections,
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
        title="Rapor gönderimi"
        description="Aylık SLA ve denetim raporunun e-postayla otomatik gönderimi."
      />
      <Card>
        <CardContent className="pt-6">
          <fieldset disabled={!canEdit} className="contents">
            <FieldGroup>
              {serverError ? (
                <Alert variant="destructive">
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              ) : null}
              {!canEdit ? (
                <Alert>
                  <AlertDescription>
                    Ayarları yalnızca müşteri yöneticisi değiştirebilir.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="report-frequency">Sıklık</FieldLabel>
                <SimpleSelect
                  id="report-frequency"
                  className="sm:w-72"
                  disabled={!canEdit}
                  value={frequency}
                  onChange={setFrequency}
                  options={REPORT_FREQUENCIES.map((value) => ({
                    value,
                    label: REPORT_FREQUENCY_LABELS[value],
                  }))}
                />
              </Field>
              <Field
                data-invalid={
                  Boolean(errors.draft ?? errors.recipients) || undefined
                }
              >
                <FieldLabel htmlFor="report-recipient">Alıcılar</FieldLabel>
                <div className="flex gap-2 sm:w-96">
                  <Input
                    id="report-recipient"
                    type="email"
                    value={draft}
                    placeholder="ad.soyad@firma.com"
                    aria-invalid={Boolean(errors.draft) || undefined}
                    onChange={(event) => {
                      setDraft(event.target.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        addRecipient()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addRecipient}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Ekle
                  </Button>
                </div>
                {(errors.draft ?? errors.recipients) ? (
                  <FieldError>{errors.draft ?? errors.recipients}</FieldError>
                ) : null}
                <ul
                  className="flex flex-wrap gap-2"
                  aria-label="Eklenen alıcılar"
                >
                  {recipients.map((email) => (
                    <li
                      key={email}
                      className="inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-sm"
                    >
                      {email}
                      {canEdit ? (
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`${email} alıcısını kaldır`}
                          onClick={() => {
                            setRecipients(
                              recipients.filter((item) => item !== email)
                            )
                          }}
                        >
                          <XIcon />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">
                  Rapor bölümleri
                </legend>
                {REPORT_SECTIONS.map((section) => {
                  const id = `report-section-${section}`
                  return (
                    <div key={section} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        disabled={!canEdit}
                        checked={sections.includes(section)}
                        onCheckedChange={(checked) => {
                          setSections(
                            checked
                              ? [...sections, section]
                              : sections.filter((item) => item !== section)
                          )
                        }}
                      />
                      <Label htmlFor={id} className="font-normal">
                        {REPORT_SECTION_LABELS[section]}
                      </Label>
                    </div>
                  )
                })}
                {errors.includeSections ? (
                  <FieldError>{errors.includeSections}</FieldError>
                ) : null}
              </fieldset>
              {subscription.updatedAt ? (
                <p className="text-xs text-muted-foreground">
                  Son güncelleme: {subscription.updatedBy} ·{" "}
                  {formatDateTime(subscription.updatedAt)}
                </p>
              ) : null}
              {canEdit ? (
                <Button
                  className="self-start"
                  disabled={mutation.isPending}
                  onClick={submit}
                >
                  {mutation.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  Kaydet
                </Button>
              ) : null}
            </FieldGroup>
          </fieldset>
        </CardContent>
      </Card>
    </div>
  )
}
