import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  CERTIFICATE_LABELS,
  CERTIFICATE_TYPES,
  type CertificateType,
} from "@/entities/location"
import { addMonthsIso } from "@/entities/ohs"
import { PersonnelCombobox } from "@/entities/personnel"
import { shiftKeys } from "@/entities/shift"
import { ApiError } from "@/shared/api/errors"
import { uploadFile } from "@/shared/api/uploads"
import { FileDropzone } from "@/shared/components/file-dropzone"
import { SimpleSelect } from "@/shared/components/simple-select"
import { toIsoDate } from "@/shared/lib/date"
import { serverNow } from "@/shared/lib/server-time"
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

import { createCertificate, ohsKeys, ohsQueries } from "../api/ohs-api"
import { certificateInputSchema } from "../model/ohs"

export interface CertificatePreset {
  personnelId?: string
  personnelName?: string
  type?: CertificateType
}

/** Sertifika ekle veya yenile (yenileme yeni kayıt açar; eski kayıt geçmişte kalır) */
export function CertificateDialog({
  preset,
  onClose,
}: {
  preset: CertificatePreset | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={preset !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        {preset ? <CertificateForm preset={preset} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function CertificateForm({
  preset,
  onDone,
}: {
  preset: CertificatePreset
  onDone: () => void
}) {
  const settings = useQuery(ohsQueries.settings())
  const today = toIsoDate(serverNow())
  const [values, setValues] = useState({
    personnelId: preset.personnelId ?? "",
    type: preset.type ?? CERTIFICATE_TYPES[0],
    number: "",
    issuedAt: today,
    expiresAt: null as string | null,
  })
  const [noExpiry, setNoExpiry] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const validity = settings.data?.certificateValidityMonths[values.type] ?? null
  const suggested = validity ? addMonthsIso(values.issuedAt, validity) : null
  const expiresAt = noExpiry ? null : (values.expiresAt ?? suggested ?? "")
  const mutation = useMutation({
    mutationFn: async () => {
      const file = files[0]
      const upload = file ? await uploadFile(file, "certificate_doc") : null
      return createCertificate({
        ...values,
        expiresAt: noExpiry ? null : expiresAt || null,
        uploadId: upload?.id ?? null,
      })
    },
    meta: {
      successMessage: "Sertifika kaydedildi",
      invalidates: [ohsKeys.all, shiftKeys.all],
    },
  })
  const submit = () => {
    const parsed = certificateInputSchema.safeParse({
      ...values,
      expiresAt: noExpiry ? null : expiresAt || null,
      uploadId: null,
    })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      return
    }
    if (!noExpiry && !expiresAt) {
      setErrors({ expiresAt: "Bitiş tarihini girin veya “Süresiz” seçin" })
      return
    }
    setErrors({})
    mutation.mutate(undefined, { onSuccess: onDone })
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {preset.type ? "Sertifikayı yenile" : "Sertifika ekle"}
        </DialogTitle>
        <DialogDescription>
          Bitiş tarihi sertifika tipinin varsayılan geçerliliğinden önerilir.
          Yeni kayıt eskisini geçersiz kılmaz; geçmişte kalır.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {mutation.error instanceof ApiError ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={Boolean(errors.personnelId) || undefined}>
          <FieldLabel>Personel</FieldLabel>
          {preset.personnelId ? (
            <p className="text-sm font-medium">{preset.personnelName}</p>
          ) : (
            <PersonnelCombobox
              value={values.personnelId || null}
              onValueChange={(personnelId) => {
                setValues({ ...values, personnelId: personnelId ?? "" })
              }}
            />
          )}
          {errors.personnelId ? (
            <FieldError>{errors.personnelId}</FieldError>
          ) : null}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="cert-type">Sertifika</FieldLabel>
            <SimpleSelect
              id="cert-type"
              value={values.type}
              disabled={Boolean(preset.type)}
              onChange={(type) => {
                setValues({ ...values, type, expiresAt: null })
              }}
              options={CERTIFICATE_TYPES.map((value) => ({
                value,
                label: CERTIFICATE_LABELS[value],
              }))}
            />
          </Field>
          <Field data-invalid={Boolean(errors.number) || undefined}>
            <FieldLabel htmlFor="cert-number">Belge no</FieldLabel>
            <Input
              id="cert-number"
              value={values.number}
              aria-invalid={Boolean(errors.number)}
              onChange={(event) => {
                setValues({ ...values, number: event.target.value })
              }}
            />
            {errors.number ? <FieldError>{errors.number}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.issuedAt) || undefined}>
            <FieldLabel htmlFor="cert-issued">Veriliş</FieldLabel>
            <Input
              id="cert-issued"
              type="date"
              value={values.issuedAt}
              onChange={(event) => {
                setValues({
                  ...values,
                  issuedAt: event.target.value,
                  expiresAt: null,
                })
              }}
            />
            {errors.issuedAt ? (
              <FieldError>{errors.issuedAt}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={Boolean(errors.expiresAt) || undefined}>
            <FieldLabel htmlFor="cert-expires">Bitiş</FieldLabel>
            <Input
              id="cert-expires"
              type="date"
              disabled={noExpiry}
              value={expiresAt ?? ""}
              aria-invalid={Boolean(errors.expiresAt)}
              onChange={(event) => {
                setValues({ ...values, expiresAt: event.target.value })
              }}
            />
            {errors.expiresAt ? (
              <FieldError>{errors.expiresAt}</FieldError>
            ) : null}
            <span className="flex items-center gap-2">
              <Checkbox
                id="cert-no-expiry"
                checked={noExpiry}
                onCheckedChange={(checked) => {
                  setNoExpiry(checked)
                }}
              />
              <Label htmlFor="cert-no-expiry" className="font-normal">
                Süresiz
              </Label>
            </span>
          </Field>
        </div>
        <FileDropzone
          files={files}
          onFilesChange={setFiles}
          accept="application/pdf,image/*"
          maxSizeBytes={10 * 1024 * 1024}
          label="Belge (isteğe bağlı)"
          description="PDF veya görsel, en fazla 10 MB"
        />
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
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
