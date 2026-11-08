import { useQuery } from "@tanstack/react-query"
import { PrinterIcon } from "lucide-react"

import { useTenant } from "@/entities/tenant"
import { ErrorState } from "@/shared/components/error-state"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime } from "@/shared/lib/format"
import { serverNow } from "@/shared/lib/server-time"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"

import { contractDetailQueries } from "../api/contracts-api"
import { LocationTable, RegionTable } from "../components/headcount-tables"
import { formatHeadcountGap, headcountGap } from "../domain/headcount"
import { monthTitle, previousMonth } from "../lib/months"
import { headcountParamsSchema } from "../model/contract"

/** Kadro raporu baskı düzeni (A4 yatay; kamu kurumuna sunulacak tutanak eki) */
export function HeadcountPrintPage() {
  const tenant = useTenant()
  const [params] = useSearchParamsState(headcountParamsSchema)
  const month = params.ay ?? previousMonth(serverNow())
  const query = useQuery(
    contractDetailQueries.headcount({
      month,
      contractId: params.sozlesme,
      orgUnitId: params.bolge,
    })
  )
  return (
    <div className="mx-auto flex max-w-[297mm] flex-col gap-4 p-6 print:p-0">
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
      <header className="flex flex-col gap-1 border-b pb-3">
        <p className="text-sm text-muted-foreground">{tenant.displayName}</p>
        <h1 className="font-heading text-xl font-semibold">
          Taahhüt ve fiili kadro raporu · {monthTitle(month)}
        </h1>
        <p className="text-xs text-muted-foreground">
          Düzenlenme: {formatDateTime(serverNow())} · Fiili kadro = planlı iş
          günlerinde çalışılan kişi-gün ÷ planlı iş günü
        </p>
      </header>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <p className="font-medium">
            Genel:{" "}
            {formatHeadcountGap(
              headcountGap(
                query.data.totals.committed,
                query.data.totals.actual
              )
            )}
          </p>
          <RegionTable report={query.data} />
          <LocationTable report={query.data} />
          <footer className="mt-8 grid break-inside-avoid grid-cols-2 gap-8 text-sm">
            <div className="border-t pt-2">Yüklenici adına</div>
            <div className="border-t pt-2">İdare / müşteri adına</div>
          </footer>
        </>
      )}
    </div>
  )
}
