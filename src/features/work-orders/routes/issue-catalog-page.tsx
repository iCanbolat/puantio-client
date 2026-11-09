import { useMutation, useQuery } from "@tanstack/react-query"
import { PencilIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import {
  AREA_TYPES,
  AREA_TYPE_LABELS,
  type AreaType,
} from "@/entities/location"
import { useCan } from "@/entities/session"
import { SERVICE_LINE_LABELS, useTenant } from "@/entities/tenant"
import { ApiError } from "@/shared/api/errors"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatusBadge } from "@/shared/components/status-badge"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
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
import { Label } from "@/shared/ui/label"
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
  updateIssueCatalog,
  workOrderKeys,
  workOrderQueries,
} from "../api/work-order-api"
import { WorkOrderPriorityBadge } from "../components/work-order-ui"
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_PRIORITY_LABELS,
  issueCatalogEntrySchema,
  type IssueCatalogEntry,
} from "../model/work-order"

type Editing = { index: number | null; entry: IssueCatalogEntry }

/** QR sayfasındaki sorun butonları: alan tipi × hizmet hattı kataloğu */
export function IssueCatalogPage() {
  const query = useQuery(workOrderQueries.catalog())
  const canWrite = useCan("quality:write")
  const tenant = useTenant()
  const [editing, setEditing] = useState<Editing | null>(null)
  const mutation = useMutation({
    mutationFn: (items: IssueCatalogEntry[]) => updateIssueCatalog({ items }),
    meta: {
      successMessage: "Katalog kaydedildi",
      invalidates: [workOrderKeys.catalog()],
    },
  })
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  const items = query.data.items
  const save = (next: IssueCatalogEntry[]) => mutation.mutateAsync(next)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bildirim kataloğu"
        description="QR bildirim sayfasında alan tipine ve lokasyonun hizmet hatlarına göre gösterilen sorun butonları. Öncelik, açılan iş emrinin SLA süresini belirler."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing({
                  index: null,
                  entry: {
                    code: "",
                    label: "",
                    serviceLine: tenant.serviceLines[0] ?? "cleaning",
                    areaTypes: ["restroom"],
                    priority: "normal",
                    isActive: true,
                  },
                })
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Sorun ekle
            </Button>
          ) : null
        }
      />
      <Table scrollLabel="Bildirim kataloğu">
        <TableHeader>
          <TableRow>
            <TableHead>Sorun</TableHead>
            <TableHead>Hizmet hattı</TableHead>
            <TableHead>Alan tipleri</TableHead>
            <TableHead>Öncelik</TableHead>
            <TableHead>Durum</TableHead>
            {canWrite ? (
              <TableHead className="text-right">İşlem</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={item.code}>
              <TableCell>
                <span className="flex flex-col">
                  <span className="font-medium">{item.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.code}
                  </span>
                </span>
              </TableCell>
              <TableCell>{SERVICE_LINE_LABELS[item.serviceLine]}</TableCell>
              <TableCell className="max-w-72 text-xs whitespace-normal">
                {item.areaTypes
                  .map((type) => AREA_TYPE_LABELS[type])
                  .join(", ")}
              </TableCell>
              <TableCell>
                <WorkOrderPriorityBadge priority={item.priority} />
              </TableCell>
              <TableCell>
                <StatusBadge tone={item.isActive ? "success" : "neutral"}>
                  {item.isActive ? "Etkin" : "Kapalı"}
                </StatusBadge>
              </TableCell>
              {canWrite ? (
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${item.label} düzenle`}
                    onClick={() => {
                      setEditing({ index, entry: item })
                    }}
                  >
                    <PencilIcon />
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <EntryDialog
        editing={editing}
        existingCodes={items.map((item) => item.code)}
        serviceLines={tenant.serviceLines}
        onClose={() => {
          setEditing(null)
        }}
        onSave={async (entry) => {
          const next = [...items]
          if (editing?.index === null || editing === null) next.push(entry)
          else next[editing.index] = entry
          await save(next)
          setEditing(null)
        }}
      />
    </div>
  )
}

function EntryDialog({
  editing,
  existingCodes,
  serviceLines,
  onClose,
  onSave,
}: {
  editing: Editing | null
  existingCodes: string[]
  serviceLines: readonly IssueCatalogEntry["serviceLine"][]
  onClose: () => void
  onSave: (entry: IssueCatalogEntry) => Promise<void>
}) {
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {editing ? (
          <EntryForm
            key={editing.index ?? "new"}
            editing={editing}
            existingCodes={existingCodes}
            serviceLines={serviceLines}
            onClose={onClose}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EntryForm({
  editing,
  existingCodes,
  serviceLines,
  onClose,
  onSave,
}: {
  editing: Editing
  existingCodes: string[]
  serviceLines: readonly IssueCatalogEntry["serviceLine"][]
  onClose: () => void
  onSave: (entry: IssueCatalogEntry) => Promise<void>
}) {
  const [entry, setEntry] = useState(editing.entry)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isNew = editing.index === null
  const submit = async () => {
    const parsed = issueCatalogEntrySchema.safeParse(entry)
    const next: Record<string, string> = {}
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message
    if (isNew && existingCodes.includes(entry.code))
      next.code = "Bu kod zaten var"
    setErrors(next)
    if (Object.keys(next).length > 0 || !parsed.success) return
    setSaving(true)
    try {
      await onSave(parsed.data)
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : "Kaydedilemedi"
      )
    } finally {
      setSaving(false)
    }
  }
  const toggleArea = (type: AreaType, checked: boolean) => {
    setEntry((current) => ({
      ...current,
      areaTypes: checked
        ? [...current.areaTypes, type]
        : current.areaTypes.filter((item) => item !== type),
    }))
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? "Sorun ekle" : "Sorunu düzenle"}</DialogTitle>
        <DialogDescription>
          Etiket QR sayfasında buton olarak görünür; kısa ve anlaşılır tutun.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {serverError ? (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.label) || undefined}>
            <FieldLabel htmlFor="issue-label">Etiket</FieldLabel>
            <Input
              id="issue-label"
              value={entry.label}
              aria-invalid={Boolean(errors.label)}
              onChange={(event) => {
                setEntry({ ...entry, label: event.target.value })
              }}
            />
            {errors.label ? <FieldError>{errors.label}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.code) || undefined}>
            <FieldLabel htmlFor="issue-code">Kod</FieldLabel>
            <Input
              id="issue-code"
              value={entry.code}
              disabled={!isNew}
              aria-invalid={Boolean(errors.code)}
              onChange={(event) => {
                setEntry({ ...entry, code: event.target.value.toLowerCase() })
              }}
            />
            {errors.code ? <FieldError>{errors.code}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="issue-service">Hizmet hattı</FieldLabel>
            <SimpleSelect
              id="issue-service"
              value={entry.serviceLine}
              onChange={(serviceLine) => {
                setEntry({ ...entry, serviceLine })
              }}
              options={serviceLines.map((value) => ({
                value,
                label: SERVICE_LINE_LABELS[value],
              }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="issue-priority">Öncelik</FieldLabel>
            <SimpleSelect
              id="issue-priority"
              value={entry.priority}
              onChange={(priority) => {
                setEntry({ ...entry, priority })
              }}
              options={WORK_ORDER_PRIORITIES.map((value) => ({
                value,
                label: WORK_ORDER_PRIORITY_LABELS[value],
              }))}
            />
          </Field>
        </div>
        <fieldset
          className="flex flex-col gap-2"
          data-invalid={Boolean(errors.areaTypes) || undefined}
        >
          <legend className="mb-2 text-sm font-medium">Alan tipleri</legend>
          <div className="grid grid-cols-2 gap-2">
            {AREA_TYPES.map((type) => {
              const id = `issue-area-${type}`
              return (
                <div key={type} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={entry.areaTypes.includes(type)}
                    onCheckedChange={(checked) => {
                      toggleArea(type, checked)
                    }}
                  />
                  <Label htmlFor={id} className="font-normal">
                    {AREA_TYPE_LABELS[type]}
                  </Label>
                </div>
              )
            })}
          </div>
          {errors.areaTypes ? (
            <FieldError>{errors.areaTypes}</FieldError>
          ) : null}
        </fieldset>
        <div className="flex items-center gap-2">
          <Checkbox
            id="issue-active"
            checked={entry.isActive}
            onCheckedChange={(checked) => {
              setEntry({ ...entry, isActive: checked })
            }}
          />
          <Label htmlFor="issue-active" className="font-normal">
            Etkin (QR sayfasında göster)
          </Label>
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button disabled={saving} onClick={() => void submit()}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
