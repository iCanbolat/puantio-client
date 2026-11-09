import { useQuery } from "@tanstack/react-query"
import { PrinterIcon } from "lucide-react"
import { useParams } from "react-router"

import { monthTitle } from "@/features/contracts"
import { useTenant } from "@/entities/tenant"
import { ErrorState } from "@/shared/components/error-state"
import { formatDateTime } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"

import { portalQueries } from "../api/portal-api"
import { MonthlyReportView } from "../components/monthly-report-view"

/** Aylık SLA ve denetim raporu baskı düzeni (A4 dikey; tarayıcıdan PDF olarak kaydedilir) */
export function PortalReportPrintPage() {
  const tenant = useTenant()
  const { month = "" } = useParams()
  const query = useQuery(portalQueries.report(month))
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
      <header className="flex flex-col gap-1 border-b pb-3">
        <p className="text-sm text-muted-foreground">{tenant.displayName}</p>
        <h1 className="font-heading text-xl font-semibold capitalize">
          SLA ve denetim raporu · {month ? monthTitle(month) : ""}
        </h1>
        {query.data ? (
          <p className="text-xs text-muted-foreground">
            {query.data.customerName} · Düzenlenme:{" "}
            {formatDateTime(query.data.generatedAt)}
          </p>
        ) : null}
      </header>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data ? (
        <MonthlyReportView report={query.data} />
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </div>
  )
}
