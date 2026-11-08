import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

import type { PenaltyRule } from "@/features/contracts"
import { useCan } from "@/entities/session"
import { SimpleSelect } from "@/shared/components/simple-select"
import { formatMoney } from "@/shared/lib/format"
import { kurus } from "@/shared/lib/money"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"
import { Textarea } from "@/shared/ui/textarea"

import {
  progressPaymentKeys,
  transitionProgressPayment,
  updatePenalties,
} from "../api/progress-payment-api"
import {
  PROGRESS_PAYMENT_ACTION_LABELS,
  type ProgressPayment,
  type ProgressPaymentAction,
} from "../model/progress-payment"

const DESCRIPTIONS: Record<ProgressPaymentAction, string> = {
  submit: "Hakediş kontrol aşamasına geçer.",
  send_to_customer:
    "Kontrol onayı verilir ve hakediş müşterinin onayına sunulur.",
  approve_customer:
    "Müşteri onayı panelden veriliyor. Gerekçe denetim kaydına yazılır; onaydan sonra hakediş kilitlenir.",
  invoice: "Kesilen faturanın numarasını girin.",
  return_to_draft:
    "Hakediş taslağa döner; düzeltme ve yeniden hesaplama açılır.",
}

export function TransitionDialog({
  payment,
  action,
  onClose,
}: {
  payment: ProgressPayment
  action: ProgressPaymentAction | null
  onClose: () => void
}) {
  const customerRole = useCan("progress_payment:approve_customer")
  const [note, setNote] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof transitionProgressPayment>[1]) =>
      transitionProgressPayment(payment.id, input),
    meta: {
      successMessage: action
        ? PROGRESS_PAYMENT_ACTION_LABELS[action]
        : undefined,
      invalidates: [progressPaymentKeys.all],
    },
  })
  const needsNote = action === "approve_customer" && !customerRole
  const close = () => {
    setNote("")
    setInvoiceNumber("")
    setError(null)
    mutation.reset()
    onClose()
  }
  const submit = () => {
    if (!action) return
    if (needsNote && note.trim() === "") {
      setError("Gerekçe zorunlu")
      return
    }
    if (action === "invoice" && invoiceNumber.trim() === "") {
      setError("Fatura numarasını girin")
      return
    }
    mutation.mutate(
      {
        action,
        note: note.trim() || null,
        invoiceNumber: action === "invoice" ? invoiceNumber.trim() : null,
      },
      { onSuccess: close }
    )
  }
  const serverError =
    mutation.error instanceof ApiError ? mutation.error.message : null
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action ? PROGRESS_PAYMENT_ACTION_LABELS[action] : ""}
          </DialogTitle>
          <DialogDescription>
            {action ? DESCRIPTIONS[action] : ""}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {serverError ? (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}
          {action === "invoice" ? (
            <Field data-invalid={Boolean(error) || undefined}>
              <FieldLabel htmlFor="invoice-number">Fatura numarası</FieldLabel>
              <Input
                id="invoice-number"
                value={invoiceNumber}
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setInvoiceNumber(event.target.value)
                }}
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          ) : (
            <Field data-invalid={Boolean(error) || undefined}>
              <FieldLabel htmlFor="transition-note">
                {needsNote ? "Gerekçe" : "Not (isteğe bağlı)"}
              </FieldLabel>
              <Textarea
                id="transition-note"
                rows={3}
                value={note}
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setNote(event.target.value)
                }}
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Vazgeç
          </Button>
          <Button disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Onayla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PenaltyDialog({
  payment,
  rules,
  open,
  onClose,
}: {
  payment: ProgressPayment
  rules: readonly PenaltyRule[]
  open: boolean
  onClose: () => void
}) {
  const [selected, setCode] = useState<string | null>(null)
  const code = selected ?? rules[0]?.code ?? null
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState("")
  const mutation = useMutation({
    mutationFn: (penalties: ProgressPayment["penalties"]) =>
      updatePenalties(payment.id, penalties),
    meta: {
      successMessage: "Ceza eklendi",
      invalidates: [progressPaymentKeys.all],
    },
  })
  const rule = rules.find((item) => item.code === code)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ceza ekle</DialogTitle>
          <DialogDescription>
            Sözleşmedeki ceza maddelerinden seçin.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="penalty-code">Ceza maddesi</FieldLabel>
            <SimpleSelect
              id="penalty-code"
              value={code}
              options={rules.map((item) => ({
                value: item.code,
                label: `${item.label} (${item.kind === "fixed" ? formatMoney(kurus(Math.round(item.amount))) : `%${item.amount}`})`,
              }))}
              onChange={setCode}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="penalty-quantity">Adet</FieldLabel>
            <Input
              id="penalty-quantity"
              type="number"
              min={1}
              className="w-28"
              value={quantity}
              onChange={(event) => {
                setQuantity(Math.max(1, Number(event.target.value) || 1))
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="penalty-note">Açıklama</FieldLabel>
            <Input
              id="penalty-note"
              value={note}
              onChange={(event) => {
                setNote(event.target.value)
              }}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            disabled={!rule || mutation.isPending}
            onClick={() => {
              if (!rule) return
              mutation.mutate(
                [
                  ...payment.penalties,
                  {
                    code: rule.code,
                    label: rule.label,
                    kind: rule.kind,
                    amount: rule.amount,
                    quantity,
                    note: note.trim() || null,
                  },
                ],
                {
                  onSuccess: () => {
                    setNote("")
                    setQuantity(1)
                    onClose()
                  },
                }
              )
            }}
          >
            Ekle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
