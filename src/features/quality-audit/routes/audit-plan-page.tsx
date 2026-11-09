import { useMutation, useQuery } from "@tanstack/react-query"
import { CalendarCheckIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { monthTitle, recentMonths } from "@/features/contracts"
import { LocationCombobox } from "@/entities/location"
import { useCan } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import { ApiError } from "@/shared/api/errors"
import { ConfirmDialog } from "@/shared/components/confirm-dialog"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { ProgressBar } from "@/shared/components/progress-bar"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatCard } from "@/shared/components/stat-card"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { toIsoDate } from "@/shared/lib/date"
import { formatDateTime } from "@/shared/lib/format"
import { serverNow } from "@/shared/lib/server-time"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import {
  createPlan,
  qualityKeys,
  qualityQueries,
  removePlan,
} from "../api/quality-api"
import {
  AUDIT_FREQUENCIES,
  AUDIT_FREQUENCY_LABELS,
  PLAN_STATE_LABELS,
  auditPlanInputSchema,
  auditPlanParamsSchema,
  type AuditFrequency,
  type AuditPlanInput,
  type AuditPlanRow,
  type PlanState,
} from "../model/audit"

const STATE_TONES = {
  complete: "success",
  on_track: "info",
  late: "danger",
} as const satisfies Record<PlanState, string>

export function AuditPlanPage() {
  const terms = useTerms()
  const [params, setParams] = useSearchParamsState(auditPlanParamsSchema)
  const query = useQuery(qualityQueries.plan(params.ay))
  const canWrite = useCan("quality:write")
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<AuditPlanRow | null>(null)
  const remove = useMutation({
    mutationFn: (id: string) => removePlan(id),
    meta: { successMessage: "Plan kaldırıldı", invalidates: [qualityKeys.all] },
  })
  const months = recentMonths(serverNow(), 6)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Denetim planı"
        description={`Denetçi × ${terms.lower(terms.location)} × şablon × sıklık. Ay içinde beklenen denetimler ile saha uygulamasından gelen sonuçların karşılaştırması.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <SimpleSelect
              aria-label="Ay"
              className="w-44"
              value={query.data?.month ?? params.ay ?? months[0] ?? null}
              onChange={(ay) => {
                setParams({ ay })
              }}
              options={months.map((month) => ({
                value: month,
                label: monthTitle(month),
              }))}
            />
            {canWrite ? (
              <Button
                onClick={() => {
                  setAdding(true)
                }}
              >
                <PlusIcon data-icon="inline-start" />
                Plan ekle
              </Button>
            ) : null}
          </div>
        }
      />
      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Planlanan" value={query.data.totals.planned} />
            <StatCard label="Gerçekleşen" value={query.data.totals.done} />
            <StatCard
              label="Eksik (süresi geçmiş)"
              value={query.data.totals.missing}
            />
          </div>
          {query.data.items.length === 0 ? (
            <EmptyState
              icon={CalendarCheckIcon}
              title="Plan yok"
              description="Kapsamınızdaki lokasyonlar için denetim planı tanımlanmamış."
            />
          ) : (
            <Table scrollLabel="Denetim planı">
              <TableHeader>
                <TableRow>
                  <TableHead>{terms.location.singular}</TableHead>
                  <TableHead>Şablon</TableHead>
                  <TableHead>Denetçi</TableHead>
                  <TableHead>Sıklık</TableHead>
                  <TableHead className="min-w-40">
                    Gerçekleşen / planlanan
                  </TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Son denetim</TableHead>
                  {canWrite ? (
                    <TableHead className="text-right">İşlem</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="flex flex-col">
                        <Link
                          to={paths.quality.audits({
                            locationId: row.locationId,
                          })}
                          className="font-medium hover:underline"
                        >
                          {row.locationName}
                        </Link>
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.locationCode}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>{row.templateName}</TableCell>
                    <TableCell>{row.auditorName}</TableCell>
                    <TableCell>
                      {AUDIT_FREQUENCY_LABELS[row.frequency]}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProgressBar
                          value={row.done}
                          max={row.planned}
                          label={`${row.locationName} plan gerçekleşmesi`}
                          className="w-20"
                        />
                        <span className="text-sm tabular-nums">
                          {row.done} / {row.planned}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STATE_TONES[row.state]}>
                        {PLAN_STATE_LABELS[row.state]}
                        {row.missing > 0
                          ? ` (${String(row.missing)} eksik)`
                          : ""}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {row.lastAuditAt ? formatDateTime(row.lastAuditAt) : "—"}
                    </TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`${row.locationName} planını kaldır`}
                          onClick={() => {
                            setRemoving(row)
                          }}
                        >
                          <Trash2Icon />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
      <AddPlanDialog
        open={adding}
        onClose={() => {
          setAdding(false)
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="Plan kaldırılsın mı?"
        description={
          removing
            ? `${removing.locationName} · ${removing.templateName}. Geçmiş denetim sonuçları korunur.`
            : undefined
        }
        confirmLabel="Kaldır"
        destructive
        onConfirm={() =>
          removing
            ? remove.mutateAsync(removing.id).then(() => {
                setRemoving(null)
              })
            : undefined
        }
      />
    </div>
  )
}

function AddPlanDialog({
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
      <DialogContent>
        {open ? <AddPlanForm onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AddPlanForm({ onDone }: { onDone: () => void }) {
  const terms = useTerms()
  const templates = useQuery(qualityQueries.templates())
  const auditors = useQuery(qualityQueries.auditors())
  const [values, setValues] = useState<{
    auditorId: string
    locationId: string
    templateId: string
    frequency: AuditFrequency
    startDate: string
  }>({
    auditorId: "",
    locationId: "",
    templateId: "",
    frequency: "weekly",
    startDate: toIsoDate(serverNow()),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: (input: AuditPlanInput) => createPlan(input),
    meta: { successMessage: "Plan eklendi", invalidates: [qualityKeys.all] },
  })
  const submit = () => {
    const parsed = auditPlanInputSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      return
    }
    setErrors({})
    mutation.mutate(parsed.data, { onSuccess: onDone })
  }
  const serverError =
    mutation.error instanceof ApiError ? mutation.error.message : null
  return (
    <>
      <DialogHeader>
        <DialogTitle>Denetim planı ekle</DialogTitle>
        <DialogDescription>
          Denetimler saha uygulamasında yapılır; plan, beklenen denetimleri ve
          gecikmeleri gösterir.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {serverError ? (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={Boolean(errors.locationId) || undefined}>
          <FieldLabel>{terms.location.singular}</FieldLabel>
          <LocationCombobox
            value={values.locationId || null}
            onValueChange={(locationId) => {
              setValues({ ...values, locationId: locationId ?? "" })
            }}
          />
          {errors.locationId ? (
            <FieldError>{errors.locationId}</FieldError>
          ) : null}
        </Field>
        <Field data-invalid={Boolean(errors.templateId) || undefined}>
          <FieldLabel htmlFor="plan-template">Şablon</FieldLabel>
          <SimpleSelect
            id="plan-template"
            invalid={Boolean(errors.templateId)}
            value={values.templateId || null}
            onChange={(templateId) => {
              setValues({ ...values, templateId })
            }}
            options={(templates.data ?? [])
              .filter((template) => template.isActive)
              .map((template) => ({
                value: template.id,
                label: template.name,
              }))}
          />
          {errors.templateId ? (
            <FieldError>{errors.templateId}</FieldError>
          ) : null}
        </Field>
        <Field data-invalid={Boolean(errors.auditorId) || undefined}>
          <FieldLabel htmlFor="plan-auditor">Denetçi</FieldLabel>
          <SimpleSelect
            id="plan-auditor"
            invalid={Boolean(errors.auditorId)}
            value={values.auditorId || null}
            onChange={(auditorId) => {
              setValues({ ...values, auditorId })
            }}
            options={(auditors.data ?? []).map((auditor) => ({
              value: auditor.id,
              label: auditor.title
                ? `${auditor.name} · ${auditor.title}`
                : auditor.name,
            }))}
          />
          {errors.auditorId ? (
            <FieldError>{errors.auditorId}</FieldError>
          ) : null}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="plan-frequency">Sıklık</FieldLabel>
            <SimpleSelect
              id="plan-frequency"
              value={values.frequency}
              onChange={(frequency) => {
                setValues({ ...values, frequency })
              }}
              options={AUDIT_FREQUENCIES.map((value) => ({
                value,
                label: AUDIT_FREQUENCY_LABELS[value],
              }))}
            />
          </Field>
          <Field data-invalid={Boolean(errors.startDate) || undefined}>
            <FieldLabel htmlFor="plan-start">Başlangıç</FieldLabel>
            <Input
              id="plan-start"
              type="date"
              value={values.startDate}
              onChange={(event) => {
                setValues({ ...values, startDate: event.target.value })
              }}
            />
            {errors.startDate ? (
              <FieldError>{errors.startDate}</FieldError>
            ) : null}
          </Field>
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Ekle
        </Button>
      </DialogFooter>
    </>
  )
}
