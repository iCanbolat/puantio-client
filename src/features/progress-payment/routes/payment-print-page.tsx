import { useQuery } from "@tanstack/react-query"
import { PrinterIcon } from "lucide-react"
import { useParams } from "react-router"

import { CONTRACT_TYPE_LABELS } from "@/entities/contract"
import { monthTitle } from "@/features/contracts"
import { useTenant } from "@/entities/tenant"
import { ErrorState } from "@/shared/components/error-state"
import { formatDateTime } from "@/shared/lib/format"
import { serverNow } from "@/shared/lib/server-time"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"

import { progressPaymentQueries } from "../api/progress-payment-api"
import { CalculationTable } from "../components/payment-ui"
import { PROGRESS_PAYMENT_STATUS_LABELS } from "../model/progress-payment"

/** Hakediş icmali baskı düzeni */
export function PaymentPrintPage() {
  const tenant = useTenant()
  const { paymentId = "" } = useParams()
  const query = useQuery(progressPaymentQueries.detail(paymentId))
  return (
    <div className="mx-auto flex max-w-[210mm] flex-col gap-4 p-6 print:p-0">
      <div className="flex justify-end print:hidden">
        <Button
          onClick={() => {
            window.print()
          }}
        >
          <PrinterIcon data-icon="inline-start" />
          Yazdır
        </Button>
      </div>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <header className="flex flex-col gap-1 border-b pb-3">
            <p className="text-sm text-muted-foreground">
              {tenant.displayName}
            </p>
            <h1 className="font-heading text-xl font-semibold">
              Hakediş icmali {query.data.number}
            </h1>
            <p className="text-sm">
              {query.data.contractCode} {query.data.contractTitle} ·{" "}
              {CONTRACT_TYPE_LABELS[query.data.contractType]}
            </p>
            <p className="text-sm">
              Müşteri: {query.data.customerName} · Dönem:{" "}
              <span className="capitalize">{monthTitle(query.data.month)}</span>{" "}
              · Durum: {PROGRESS_PAYMENT_STATUS_LABELS[query.data.status]}
            </p>
            <p className="text-xs text-muted-foreground">
              Düzenlenme: {formatDateTime(serverNow())}
            </p>
          </header>
          <CalculationTable calculation={query.data.calculation} />
          <footer className="mt-10 grid break-inside-avoid grid-cols-3 gap-6 text-sm">
            <div className="border-t pt-2">Düzenleyen</div>
            <div className="border-t pt-2">Kontrol eden</div>
            <div className="border-t pt-2">Onaylayan (idare / müşteri)</div>
          </footer>
        </>
      )}
    </div>
  )
}
