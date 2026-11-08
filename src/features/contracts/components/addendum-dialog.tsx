import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { contractKeys } from "@/entities/contract"
import { ApiError } from "@/shared/api/errors"
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import { addAddendum } from "../api/contracts-api"
import { checkAddendum } from "../domain/versions"
import { bodyErrors, normalizeBody, serverBodyErrors } from "../lib/body-form"
import {
  latestVersion,
  type Contract,
  type VersionBody,
} from "../model/contract"
import {
  CommitmentsEditor,
  LocationPicker,
  PricesEditor,
  RulesEditor,
  type ErrorMap,
} from "./body-editors"

/** Zeyilname: son sürümden kopyalanır, yürürlük tarihiyle yeni sürüm olarak kaydedilir. */
export function AddendumDialog({
  contract,
  open,
  onClose,
}: {
  contract: Contract
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
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        {open ? <AddendumForm contract={contract} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AddendumForm({
  contract,
  onDone,
}: {
  contract: Contract
  onDone: () => void
}) {
  const last = latestVersion(contract.versions)
  const [effectiveFrom, setEffectiveFrom] = useState("")
  const [note, setNote] = useState("")
  const [body, setBody] = useState<VersionBody>(() => ({
    serviceLines: [...last.serviceLines],
    scopeItems: structuredClone(last.scopeItems),
    locations: structuredClone(last.locations),
    commitments: structuredClone(last.commitments),
    prices: structuredClone(last.prices),
    rules: structuredClone(last.rules),
  }))
  const [errors, setErrors] = useState<ErrorMap>({})
  const [headerErrors, setHeaderErrors] = useState<{
    effectiveFrom?: string
    note?: string
  }>({})
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof addAddendum>[1]) =>
      addAddendum(contract.id, input),
    meta: {
      successMessage: "Zeyilname eklendi",
      invalidates: [contractKeys.all],
    },
  })

  const submit = async () => {
    const header: typeof headerErrors = {}
    if (!effectiveFrom) header.effectiveFrom = "Yürürlük tarihini girin"
    else {
      const check = checkAddendum(contract, contract.versions, effectiveFrom)
      if (!check.ok) header.effectiveFrom = check.message
    }
    if (note.trim().length < 3) header.note = "Zeyilname açıklaması girin"
    const found = bodyErrors(body)
    setHeaderErrors(header)
    setErrors(found)
    if (Object.keys(header).length > 0 || Object.keys(found).length > 0) return
    try {
      await mutation.mutateAsync({
        effectiveFrom,
        note: note.trim(),
        body: normalizeBody(body),
      })
      onDone()
    } catch (error) {
      if (!(error instanceof ApiError)) return
      if (error.status === 409)
        setHeaderErrors({ effectiveFrom: error.message })
      else if (error.status === 422) {
        setErrors(serverBodyErrors(error.fieldErrors))
        const message = error.fieldErrors?.effectiveFrom?.[0]
        if (message) setHeaderErrors({ effectiveFrom: message })
      }
    }
  }

  const hasBodyErrors = Object.keys(errors).length > 0
  return (
    <>
      <DialogHeader>
        <DialogTitle>Zeyilname ekle</DialogTitle>
        <DialogDescription>
          Son sürümden kopyalanır. Önceki sürüm yürürlük tarihinden bir gün önce
          kapanır; hakediş dönem içindeki değişikliği kıst hesaplar.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <Field
            data-invalid={Boolean(headerErrors.effectiveFrom) || undefined}
          >
            <FieldLabel htmlFor="addendum-from">Yürürlük tarihi</FieldLabel>
            <Input
              id="addendum-from"
              type="date"
              value={effectiveFrom}
              min={contract.startDate}
              max={contract.endDate}
              aria-invalid={Boolean(headerErrors.effectiveFrom)}
              onChange={(event) => {
                setEffectiveFrom(event.target.value)
              }}
            />
            {headerErrors.effectiveFrom ? (
              <FieldError>{headerErrors.effectiveFrom}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={Boolean(headerErrors.note) || undefined}>
            <FieldLabel htmlFor="addendum-note">Açıklama</FieldLabel>
            <Textarea
              id="addendum-note"
              rows={2}
              value={note}
              aria-invalid={Boolean(headerErrors.note)}
              onChange={(event) => {
                setNote(event.target.value)
              }}
            />
            {headerErrors.note ? (
              <FieldError>{headerErrors.note}</FieldError>
            ) : null}
          </Field>
        </div>
        {hasBodyErrors ? (
          <Alert variant="destructive">
            <AlertDescription>
              Zeyilname bilgilerinde hata var; işaretli alanları düzeltin.
            </AlertDescription>
          </Alert>
        ) : null}
        <FieldSet>
          <FieldLegend>Lokasyonlar</FieldLegend>
          <LocationPicker
            customerId={contract.customerId}
            locations={body.locations}
            defaultFrom={effectiveFrom || contract.startDate}
            errors={errors}
            allowRemovalDate
            onChange={(locations) => {
              setBody((current) => ({ ...current, locations }))
            }}
          />
        </FieldSet>
        <FieldSet>
          <FieldLegend>Taahhüt kadro</FieldLegend>
          <CommitmentsEditor
            locations={body.locations}
            commitments={body.commitments}
            errors={errors}
            onChange={(commitments) => {
              setBody((current) => ({ ...current, commitments }))
            }}
          />
        </FieldSet>
        <FieldSet>
          <FieldLegend>Birim fiyatlar</FieldLegend>
          <PricesEditor
            commitments={body.commitments}
            prices={body.prices}
            errors={errors}
            onChange={(prices) => {
              setBody((current) => ({ ...current, prices }))
            }}
          />
        </FieldSet>
        <FieldSet>
          <FieldLegend>Kurallar</FieldLegend>
          <RulesEditor
            rules={body.rules}
            errors={errors}
            onChange={(rules) => {
              setBody((current) => ({ ...current, rules }))
            }}
          />
        </FieldSet>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() => void submit()}
        >
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Zeyilnameyi kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
