import { useMutation, useQuery } from "@tanstack/react-query"
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"

import { Can } from "@/entities/session"
import { ErrorState } from "@/shared/components/error-state"
import { formatMoney } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import {
  progressPaymentKeys,
  progressPaymentQueries,
  recalculateProgressPayment,
} from "../api/progress-payment-api"

/** Taslaktan sonra puantaj değişti: uyarı, fark tablosu ve yeniden hesaplama (TC-3.3-05) */
export function StalePanel({ paymentId }: { paymentId: string }) {
  const [showDiff, setShowDiff] = useState(false)
  const preview = useQuery({
    ...progressPaymentQueries.recalculation(paymentId),
    enabled: showDiff,
  })
  const recalculate = useMutation({
    mutationFn: () => recalculateProgressPayment(paymentId),
    meta: {
      successMessage: "Hakediş güncel puantajla yeniden hesaplandı",
      invalidates: [progressPaymentKeys.all],
    },
  })
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>Güncel değil</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          Taslak hazırlandıktan sonra dönemin puantajı değişti. Kontrole
          göndermeden önce yeniden hesaplayın.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowDiff((value) => !value)
            }}
          >
            {showDiff ? "Farkı gizle" : "Farkı göster"}
          </Button>
          <Can permission="progress_payment:approve">
            <Button
              size="sm"
              disabled={recalculate.isPending}
              onClick={() => {
                recalculate.mutate()
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Yeniden hesapla
            </Button>
          </Can>
        </div>
        {showDiff ? (
          preview.isError ? (
            <ErrorState
              error={preview.error}
              onRetry={() => void preview.refetch()}
            />
          ) : !preview.data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="rounded-lg border bg-background text-foreground">
              <Table scrollLabel="Fark tablosu alanı">
                <caption className="sr-only">Fark tablosu</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kalem</TableHead>
                    <TableHead className="text-right">Taslak</TableHead>
                    <TableHead className="text-right">Güncel</TableHead>
                    <TableHead className="text-right">Fark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.data.changes.map((change) => (
                    <TableRow key={change.key}>
                      <TableCell>{change.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {change.before === null
                          ? "—"
                          : formatMoney(change.before)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {change.after === null
                          ? "—"
                          : formatMoney(change.after)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          change.difference < 0 && "text-destructive"
                        )}
                      >
                        {formatMoney(change.difference)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
