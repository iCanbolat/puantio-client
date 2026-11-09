import { useQuery } from "@tanstack/react-query"
import { lazy, Suspense } from "react"
import { Link } from "react-router"

import { recentMonths, monthTitle } from "@/features/contracts"
import { useTerms } from "@/entities/tenant"
import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { ErrorState } from "@/shared/components/error-state"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime } from "@/shared/lib/format"
import { serverNow } from "@/shared/lib/server-time"
import { buttonVariants } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"

import { qualityQueries } from "../api/quality-api"
import { AuditScoreBadge } from "../components/audit-ui"
import { auditListParamsSchema, type AuditSummary } from "../model/audit"

const ScoreTrendChart = lazy(() => import("../components/score-trend-chart"))

const RESULT_LABELS = {
  passed: "Başarılı",
  failed: "Başarısız",
  critical: "Kritik bulgulu",
} as const

const helper = createDataTableColumnHelper<AuditSummary>()

const columns = helper.columns([
  helper.accessor("number", {
    header: "Denetim",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <span className="flex min-w-36 flex-col">
        <Link
          to={paths.quality.audit(row.original.id)}
          className="font-mono text-xs font-medium hover:underline"
        >
          {row.original.number}
        </Link>
        <span className="text-xs text-muted-foreground">
          {row.original.templateName}
        </span>
      </span>
    ),
    meta: { label: "Denetim" },
  }),
  helper.accessor("locationName", {
    header: "Lokasyon",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="flex min-w-44 flex-col">
        <span>{row.original.locationName}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.orgUnitName} · {row.original.customerName}
        </span>
      </span>
    ),
    meta: { label: "Lokasyon" },
  }),
  helper.accessor("performedAt", {
    id: "performedAt",
    header: "Tarih",
    cell: (info) => (
      <span className="whitespace-nowrap">
        {formatDateTime(info.getValue())}
      </span>
    ),
    meta: { label: "Tarih" },
  }),
  helper.accessor("score", {
    id: "score",
    header: "Puan",
    cell: ({ row }) => (
      <AuditScoreBadge
        score={row.original.score}
        passed={row.original.passed}
        criticalFailures={row.original.criticalFailures}
      />
    ),
    meta: { label: "Puan", exportValue: (row) => String(row.score) },
  }),
  helper.accessor("workOrderCount", {
    header: "İş emri",
    enableSorting: false,
    cell: (info) => (info.getValue() > 0 ? info.getValue() : "—"),
    meta: { label: "İş emri", align: "right" },
  }),
  helper.accessor("auditorName", {
    header: "Denetçi",
    enableSorting: false,
    meta: { label: "Denetçi" },
  }),
])

export function AuditListPage() {
  const terms = useTerms()
  const [params, setParams, resetParams] = useSearchParamsState(
    auditListParamsSchema
  )
  const state = {
    ...params,
    sort: params.sort ?? "performedAt",
    order: params.order ?? "desc",
  }
  const query = useQuery(qualityQueries.audits(state))
  const trend = useQuery(
    qualityQueries.trend({
      groupBy: "orgUnit",
      months: 6,
      locationId: params.locationId,
    })
  )
  const months = recentMonths(serverNow(), 6)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kalite denetimleri"
        description="Saha uygulamasından gelen denetim sonuçları, puan trendi ve kritik bulgular. Kritik madde başarısızsa iş emri otomatik açılır."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={paths.quality.plan()}
              className={buttonVariants({ variant: "outline" })}
            >
              Denetim planı
            </Link>
            <Link
              to={paths.quality.templates()}
              className={buttonVariants({ variant: "outline" })}
            >
              Şablonlar
            </Link>
          </div>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Puan trendi</CardTitle>
          <CardDescription>
            Son 6 ay,{" "}
            {terms.orgLevels[0]?.singular.toLocaleLowerCase("tr") ?? "bölge"}{" "}
            bazında aylık ortalama
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trend.isError ? (
            <ErrorState
              error={trend.error}
              onRetry={() => void trend.refetch()}
            />
          ) : trend.data ? (
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <ScoreTrendChart trend={trend.data} />
            </Suspense>
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </CardContent>
      </Card>
      <DataTable
        tableId="denetimler"
        caption="Denetim sonuçları"
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        state={state}
        onStateChange={(patch) => {
          setParams(patch)
        }}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        enableCsvExport
        toolbar={
          <FilterBar
            search={params.q}
            onSearchChange={(q) => {
              setParams({ q, page: 1 }, { replace: true })
            }}
            searchPlaceholder="No, lokasyon veya denetçi ara…"
            searchLabel="Denetimlerde ara"
            activeFilterCount={
              [params.result, params.month, params.locationId].filter(Boolean)
                .length
            }
            onReset={resetParams}
          >
            <EnumFilter<keyof typeof RESULT_LABELS>
              label="Sonuç filtresi"
              allLabel="Tüm sonuçlar"
              value={params.result}
              options={["passed", "failed", "critical"] as const}
              labels={RESULT_LABELS}
              onChange={(result) => {
                setParams({ result, page: 1 })
              }}
            />
            <EnumFilter<string>
              label="Ay filtresi"
              allLabel="Tüm aylar"
              value={params.month}
              options={months}
              labels={Object.fromEntries(
                months.map((month) => [month, monthTitle(month)])
              )}
              onChange={(month) => {
                setParams({ month, page: 1 })
              }}
            />
          </FilterBar>
        }
      />
    </div>
  )
}
