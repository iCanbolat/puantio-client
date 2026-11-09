import { useMutation, useQuery } from "@tanstack/react-query"
import { DownloadIcon, PrinterIcon } from "lucide-react"
import { Link } from "react-router"
import { z } from "zod"

import { monthTitle } from "@/features/contracts"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { cn } from "@/shared/lib/utils"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Spinner } from "@/shared/ui/spinner"

import { downloadReport, portalQueries } from "../api/portal-api"
import { MonthlyReportView } from "../components/monthly-report-view"
import { monthSchema } from "../model/portal"

const paramsSchema = z.object({ ay: monthSchema.optional().catch(undefined) })

/** Aylık SLA ve denetim raporu arşivi */
export function PortalReportsPage() {
  const [params, setParams] = useSearchParamsState(paramsSchema)
  const archive = useQuery(portalQueries.reports())
  const selected =
    params.ay ?? archive.data?.find((item) => !item.partial)?.month
  const report = useQuery({
    ...portalQueries.report(selected ?? ""),
    enabled: Boolean(selected),
  })
  const download = useMutation({
    mutationFn: (month: string) => downloadReport(month),
    meta: { successMessage: "Rapor indirildi" },
  })
  if (archive.isPending) return <PageSkeleton />
  if (archive.isError)
    return (
      <ErrorState
        error={archive.error}
        onRetry={() => void archive.refetch()}
      />
    )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Raporlar"
        description="Aylık SLA ve denetim raporları. Excel dosyası Power Apps / BI aktarımı için düz tablo içerir."
        actions={
          selected ? (
            <div className="flex flex-wrap gap-2">
              <Link
                to={paths.print.portalReport(selected)}
                target="_blank"
                className={buttonVariants({ variant: "outline" })}
              >
                <PrinterIcon data-icon="inline-start" />
                Yazdır / PDF
              </Link>
              <Button
                variant="outline"
                disabled={download.isPending}
                onClick={() => {
                  download.mutate(selected)
                }}
              >
                {download.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <DownloadIcon data-icon="inline-start" />
                )}
                Excel
              </Button>
            </div>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Rapor arşivi">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col">
            {archive.data.map((item) => (
              <li key={item.month}>
                <button
                  type="button"
                  aria-current={item.month === selected ? "page" : undefined}
                  onClick={() => {
                    setParams({ ay: item.month })
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm whitespace-nowrap capitalize hover:bg-muted",
                    item.month === selected && "bg-muted font-medium"
                  )}
                >
                  {monthTitle(item.month)}
                  {item.partial ? (
                    <StatusBadge tone="info">Devam ediyor</StatusBadge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <Card>
          <CardHeader>
            <CardTitle className="capitalize">
              {selected ? monthTitle(selected) : "Rapor"}
              {report.data ? ` · ${report.data.customerName}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.isError ? (
              <ErrorState
                error={report.error}
                onRetry={() => void report.refetch()}
              />
            ) : report.data ? (
              <MonthlyReportView report={report.data} />
            ) : (
              <PageSkeleton />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
