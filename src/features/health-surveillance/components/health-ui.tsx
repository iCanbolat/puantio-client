import { useMutation } from "@tanstack/react-query"
import { EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { Can } from "@/entities/session"
import { ApiError } from "@/shared/api/errors"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatusBadge, type StatusTone } from "@/shared/components/status-badge"
import { toIsoDate } from "@/shared/lib/date"
import { formatDate, formatDateTime } from "@/shared/lib/format"
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
import { Textarea } from "@/shared/ui/textarea"

import { revealHealthRecord, updateHealthRecord } from "../api/health-api"
import { useRevealedRecord } from "./use-revealed-record"
import {
  HEALTH_DUE_LABELS,
  HEALTH_RESULTS,
  HEALTH_RESULT_LABELS,
  REVEAL_REASON_MIN,
  healthRecordInputSchema,
  revealInputSchema,
  type HealthDue,
  type HealthRecord,
  type HealthResult,
  type RevealResponse,
  type Vaccination,
} from "../model/health"

const DUE_TONES: Record<HealthDue, StatusTone> = {
  overdue: "danger",
  d30: "warning",
  ok: "success",
  none: "neutral",
}
const RESULT_TONES: Record<HealthResult, StatusTone> = {
  fit: "success",
  conditional: "warning",
  unfit: "danger",
}

export function HealthDueBadge({ due }: { due: HealthDue }) {
  return (
    <StatusBadge tone={DUE_TONES[due]}>{HEALTH_DUE_LABELS[due]}</StatusBadge>
  )
}

export function RevealForm({
  personnelId,
  personnelName,
  onRevealed,
  onCancel,
}: {
  personnelId: string
  personnelName: string
  onRevealed: (result: RevealResponse) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (value: string) =>
      revealHealthRecord(personnelId, { reason: value }),
    // Yanıt mutasyon önbelleğinde de tutulmaz
    gcTime: 0,
  })
  const submit = () => {
    const parsed = revealInputSchema.safeParse({ reason })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Gerekçe girin")
      return
    }
    setError(null)
    mutation.mutate(parsed.data.reason, { onSuccess: onRevealed })
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Sağlık verisini göster</DialogTitle>
        <DialogDescription>
          {personnelName}: özel nitelikli kişisel veri. Görüntüleme gerekçesi ve
          adınız erişim kaydına yazılır; veri 5 dakika sonra yeniden maskelenir.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {mutation.error instanceof ApiError ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="reveal-reason">Gerekçe</FieldLabel>
          <Textarea
            id="reveal-reason"
            value={reason}
            aria-invalid={Boolean(error)}
            placeholder={`En az ${REVEAL_REASON_MIN} karakter (ör. periyodik muayene planlaması)`}
            onChange={(event) => {
              setReason(event.target.value)
            }}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <EyeIcon data-icon="inline-start" />
          )}
          Göster
        </Button>
      </DialogFooter>
    </>
  )
}

export function HealthRecordDetails({
  record,
  onEdit,
}: {
  record: HealthRecord | null
  onEdit?: () => void
}) {
  return (
    <div className="flex flex-col gap-3 text-sm" aria-label="Sağlık kaydı">
      {record ? (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Son muayene</dt>
            <dd>{formatDate(record.examinedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sonraki muayene</dt>
            <dd>{formatDate(record.nextExamAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sonuç</dt>
            <dd>
              <StatusBadge tone={RESULT_TONES[record.result]}>
                {HEALTH_RESULT_LABELS[record.result]}
              </StatusBadge>
            </dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-muted-foreground">Aşılar</dt>
            <dd>
              {record.vaccinations.length === 0
                ? "Kayıt yok"
                : record.vaccinations
                    .map(
                      (item) =>
                        `${item.type} (${formatDate(item.date)}${item.nextDoseAt ? `, sonraki doz ${formatDate(item.nextDoseAt)}` : ""})`
                    )
                    .join(", ")}
            </dd>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Güncelleyen: {record.updatedBy} · {formatDateTime(record.updatedAt)}
          </p>
        </dl>
      ) : (
        <p className="text-muted-foreground">Muayene kaydı yok.</p>
      )}
      {onEdit ? (
        <Can permission="health:write">
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={onEdit}
          >
            {record ? (
              <PencilIcon data-icon="inline-start" />
            ) : (
              <PlusIcon data-icon="inline-start" />
            )}
            {record ? "Muayene kaydını güncelle" : "Muayene kaydı ekle"}
          </Button>
        </Can>
      ) : null}
    </div>
  )
}

export function HealthEditForm({
  personnelId,
  record,
  onSaved,
  onCancel,
}: {
  personnelId: string
  record: HealthRecord | null
  onSaved: (result: RevealResponse) => void
  onCancel: () => void
}) {
  const [examinedAt, setExaminedAt] = useState(
    record?.examinedAt ?? toIsoDate(serverNow())
  )
  const [result, setResult] = useState<HealthResult>(record?.result ?? "fit")
  const [vaccinations, setVaccinations] = useState<Vaccination[]>(
    record?.vaccinations ?? []
  )
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () =>
      updateHealthRecord(personnelId, { examinedAt, result, vaccinations }),
    gcTime: 0,
    meta: { successMessage: "Muayene kaydı güncellendi" },
  })
  const submit = () => {
    const parsed = healthRecordInputSchema.safeParse({
      examinedAt,
      result,
      vaccinations,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Formda hatalı alanlar var")
      return
    }
    setError(null)
    mutation.mutate(undefined, { onSuccess: onSaved })
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Muayene kaydı</DialogTitle>
        <DialogDescription>
          Tanı ve açıklama tutulmaz; yalnızca tarih, sonuç ve aşılar. Sonraki
          muayene tarihi tehlike sınıfına göre hesaplanır.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {error || mutation.error instanceof ApiError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error ?? (mutation.error as ApiError).message}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="health-examined">Muayene tarihi</FieldLabel>
            <Input
              id="health-examined"
              type="date"
              value={examinedAt}
              onChange={(event) => {
                setExaminedAt(event.target.value)
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="health-result">Sonuç</FieldLabel>
            <SimpleSelect
              id="health-result"
              value={result}
              onChange={setResult}
              options={HEALTH_RESULTS.map((value) => ({
                value,
                label: HEALTH_RESULT_LABELS[value],
              }))}
            />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Aşılar</legend>
          {vaccinations.map((item, index) => (
            <div
              key={index}
              className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]"
            >
              <Field>
                <FieldLabel htmlFor={`vac-type-${index}`}>Aşı</FieldLabel>
                <Input
                  id={`vac-type-${index}`}
                  value={item.type}
                  onChange={(event) => {
                    setVaccinations(
                      vaccinations.map((v, i) =>
                        i === index ? { ...v, type: event.target.value } : v
                      )
                    )
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`vac-date-${index}`}>Tarih</FieldLabel>
                <Input
                  id={`vac-date-${index}`}
                  type="date"
                  value={item.date}
                  onChange={(event) => {
                    setVaccinations(
                      vaccinations.map((v, i) =>
                        i === index ? { ...v, date: event.target.value } : v
                      )
                    )
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`vac-next-${index}`}>
                  Sonraki doz
                </FieldLabel>
                <Input
                  id={`vac-next-${index}`}
                  type="date"
                  value={item.nextDoseAt ?? ""}
                  onChange={(event) => {
                    setVaccinations(
                      vaccinations.map((v, i) =>
                        i === index
                          ? { ...v, nextDoseAt: event.target.value || null }
                          : v
                      )
                    )
                  }}
                />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${item.type || "Aşı"} kaydını kaldır`}
                onClick={() => {
                  setVaccinations(vaccinations.filter((_, i) => i !== index))
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => {
              setVaccinations([
                ...vaccinations,
                { type: "", date: examinedAt, nextDoseAt: null },
              ])
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Aşı ekle
          </Button>
        </fieldset>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}

/** Gerekçe → görüntüleme → (yetki varsa) düzenleme akışını tek diyalogda yönetir */
export function HealthRecordDialog({
  target,
  onClose,
}: {
  target: { personnelId: string; name: string } | null
  onClose: () => void
}) {
  const [revealed, setRevealed] = useRevealedRecord()
  const [editing, setEditing] = useState(false)
  const close = () => {
    setRevealed(null)
    setEditing(false)
    onClose()
  }
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-xl">
        {target === null ? null : !revealed ? (
          <RevealForm
            personnelId={target.personnelId}
            personnelName={target.name}
            onRevealed={setRevealed}
            onCancel={close}
          />
        ) : editing ? (
          <HealthEditForm
            personnelId={target.personnelId}
            record={revealed.record}
            onSaved={(result) => {
              setRevealed(result)
              setEditing(false)
            }}
            onCancel={() => {
              setEditing(false)
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{target.name}</DialogTitle>
              <DialogDescription>
                Görüntüleme erişim kaydına yazıldı.
              </DialogDescription>
            </DialogHeader>
            <HealthRecordDetails
              record={revealed.record}
              onEdit={() => {
                setEditing(true)
              }}
            />
            <DialogFooter>
              <Button onClick={close}>Kapat ve maskele</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
