import { useQuery } from "@tanstack/react-query"
import { PrinterIcon } from "lucide-react"
import { useParams } from "react-router"
import { z } from "zod"

import { useTenant } from "@/entities/tenant"
import { ErrorState } from "@/shared/components/error-state"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"

import { ohsQueries } from "../api/ohs-api"
import { AuditPackView } from "../components/audit-pack-view"

const printParamsSchema = z.object({
  kaynak: z.enum(["portal"]).optional().catch(undefined),
})

/** Denetim paketi baskı düzeni (A4 yatay) */
export function AuditPackPrintPage() {
  const tenant = useTenant()
  const { locationId = "" } = useParams()
  const [{ kaynak }] = useSearchParamsState(printParamsSchema)
  const query = useQuery(ohsQueries.auditPack(locationId, kaynak === "portal"))
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
          İSG denetim paketi
        </h1>
        {query.data ? (
          <p className="text-xs text-muted-foreground">
            Düzenlenme: {formatDateTime(query.data.generatedAt)} · Sağlık verisi
            içermez
            {query.data.includesHealth ? " (yalnızca “Uygun” bilgisi)" : ""}
          </p>
        ) : null}
      </header>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data ? (
        <AuditPackView pack={query.data} />
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </div>
  )
}
