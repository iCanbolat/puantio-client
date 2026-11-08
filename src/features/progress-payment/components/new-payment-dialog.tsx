import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router"

import { monthTitle, previousMonth, recentMonths } from "@/features/contracts"
import { contractQueries } from "@/entities/contract"
import { ApiError } from "@/shared/api/errors"
import { SimpleSelect } from "@/shared/components/simple-select"
import { paths } from "@/shared/config/paths"
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
import { Spinner } from "@/shared/ui/spinner"

import {
  createProgressPayment,
  progressPaymentKeys,
} from "../api/progress-payment-api"

export function NewPaymentDialog({
  open,
  onClose,
  defaultContractId,
}: {
  open: boolean
  onClose: () => void
  defaultContractId?: string | undefined
}) {
  const navigate = useNavigate()
  const contracts = useQuery({ ...contractQueries.options(), enabled: open })
  const [contractId, setContractId] = useState<string | null>(
    defaultContractId ?? null
  )
  const [month, setMonth] = useState(previousMonth(serverNow()))
  const [missing, setMissing] = useState(false)
  const mutation = useMutation({
    mutationFn: createProgressPayment,
    meta: {
      successMessage: "Hakediş taslağı oluşturuldu",
      invalidates: [progressPaymentKeys.all],
    },
  })
  const error =
    mutation.error instanceof ApiError ? mutation.error.message : null
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni hakediş</DialogTitle>
          <DialogDescription>
            Taslak, dönemin puantajından (çalışılan kişi-gün ve fazla mesai)
            sözleşme sürümlerine göre hesaplanır.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={missing || undefined}>
            <FieldLabel htmlFor="payment-contract">Sözleşme</FieldLabel>
            <SimpleSelect
              id="payment-contract"
              value={contractId}
              invalid={missing}
              placeholder="Sözleşme seçin"
              options={(contracts.data ?? []).map((item) => ({
                value: item.value,
                label: item.label,
              }))}
              onChange={(value) => {
                setContractId(value)
                setMissing(false)
              }}
            />
            {missing ? <FieldError>Sözleşme seçin</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="payment-month">Dönem</FieldLabel>
            <SimpleSelect
              id="payment-month"
              value={month}
              options={recentMonths(serverNow()).map((value) => ({
                value,
                label: monthTitle(value),
              }))}
              onChange={setMonth}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              if (!contractId) {
                setMissing(true)
                return
              }
              mutation.mutate(
                { contractId, month },
                {
                  onSuccess: (payment) => {
                    onClose()
                    void navigate(paths.progressPayments.detail(payment.id))
                  },
                }
              )
            }}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Taslak oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
