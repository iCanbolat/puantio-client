import { useMutation, useQuery } from "@tanstack/react-query"
import { CheckIcon } from "lucide-react"

import { monthTitle } from "@/features/contracts"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { formatMoney } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"

import {
  progressPaymentKeys,
  progressPaymentQueries,
  transitionProgressPayment,
} from "../api/progress-payment-api"
import { CalculationTable, PaymentStatusBadge } from "./payment-ui"

/** Müşteri portalı: hakediş onayı (Faz 4 portalına kadar küçük sayfa) */
export function CustomerProgressPayments() {
  const query = useQuery(progressPaymentQueries.portal())
  const approve = useMutation({
    mutationFn: (id: string) =>
      transitionProgressPayment(id, { action: "approve_customer" }),
    meta: {
      successMessage: "Hakediş onaylandı",
      invalidates: [progressPaymentKeys.all],
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Hakediş onayları</h1>
        </CardTitle>
        <CardDescription>
          Hizmet sağlayıcınızın aylık hakedişleri onayınıza sunulur. Onaydan
          sonra fatura kesilir.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : query.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : query.data.length === 0 ? (
          <EmptyState title="Hakediş yok" />
        ) : (
          <ul className="flex flex-col divide-y" aria-label="Hakedişler">
            {query.data.map((payment) => (
              <li key={payment.id} className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex flex-col">
                    <span className="font-medium capitalize">
                      {monthTitle(payment.month)} · {payment.number}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {payment.contractTitle} · {formatMoney(payment.total)}
                    </span>
                  </span>
                  <PaymentStatusBadge status={payment.status} />
                  {payment.availableActions.includes("approve_customer") ? (
                    <Button
                      className="ml-auto"
                      disabled={approve.isPending}
                      onClick={() => {
                        approve.mutate(payment.id)
                      }}
                    >
                      <CheckIcon data-icon="inline-start" />
                      Hakedişi onayla
                    </Button>
                  ) : null}
                </div>
                {payment.status === "customer_approval" ? (
                  <CalculationTable calculation={payment.calculation} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
