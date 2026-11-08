import { useMutation, useQuery } from "@tanstack/react-query"
import { DownloadIcon, PrinterIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { contractQueries } from "@/entities/contract"
import { OrgUnitSelect } from "@/entities/org-unit"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatCard } from "@/shared/components/stat-card"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { serverNow } from "@/shared/lib/server-time"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Field, FieldLabel } from "@/shared/ui/field"
import { Skeleton } from "@/shared/ui/skeleton"

import {
  contractDetailQueries,
  downloadHeadcountReport,
} from "../api/contracts-api"
import { HeadcountLocationSheet } from "../components/headcount-location-sheet"
import { LocationTable, RegionTable } from "../components/headcount-tables"
import { formatHeadcountGap, headcountGap } from "../domain/headcount"
import { monthTitle, previousMonth, recentMonths } from "../lib/months"
import { headcountParamsSchema } from "../model/contract"

const ALL = "__all__"

export function HeadcountPage() {
  const [params, setParams] = useSearchParamsState(headcountParamsSchema)
  const month = params.ay ?? previousMonth(serverNow())
  const query = {
    month,
    contractId: params.sozlesme,
    orgUnitId: params.bolge,
  }
  const report = useQuery(contractDetailQueries.headcount(query))
  const contracts = useQuery(contractQueries.options())
  const [target, setTarget] = useState<{
    contractId: string
    locationId: string
    name: string
  } | null>(null)
  const download = useMutation({
    mutationFn: () => downloadHeadcountReport(query),
    meta: { errorMessage: "Rapor indirilemedi" },
  })

  const data = report.data
  const gap = data
    ? headcountGap(data.totals.committed, data.totals.actual)
    : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Taahhüt ve fiili kadro"
        description="Fiili kadro = planlı iş günlerinde çalışılan kişi-gün ÷ planlı iş günü. Çalışma, vardiyanın yapıldığı lokasyona yazılır (yedek personel dahil)."
        actions={
          <>
            <Button
              variant="outline"
              disabled={download.isPending || !data}
              onClick={() => {
                download.mutate()
              }}
            >
              <DownloadIcon data-icon="inline-start" />
              Excel indir
            </Button>
            <Link
              to={paths.print.headcount(query)}
              target="_blank"
              className={buttonVariants({ variant: "outline" })}
            >
              <PrinterIcon data-icon="inline-start" />
              Baskı düzeni
            </Link>
          </>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-44">
          <FieldLabel htmlFor="headcount-month">Dönem</FieldLabel>
          <SimpleSelect
            id="headcount-month"
            value={month}
            options={recentMonths(serverNow()).map((value) => ({
              value,
              label: monthTitle(value),
            }))}
            onChange={(ay) => {
              setParams({ ay })
            }}
          />
        </Field>
        <Field className="w-80 max-w-full">
          <FieldLabel htmlFor="headcount-contract">Sözleşme</FieldLabel>
          <SimpleSelect
            id="headcount-contract"
            value={params.sozlesme ?? ALL}
            options={[
              { value: ALL, label: "Tüm sözleşmeler" },
              ...(contracts.data ?? []).map((item) => ({
                value: item.value,
                label: item.label,
              })),
            ]}
            onChange={(value) => {
              setParams({ sozlesme: value === ALL ? undefined : value })
            }}
          />
        </Field>
        <Field className="w-64 max-w-full">
          <FieldLabel htmlFor="headcount-region">Bölge</FieldLabel>
          <OrgUnitSelect
            id="headcount-region"
            value={params.bolge ?? null}
            allowAll
            onValueChange={(bolge) => {
              setParams({ bolge: bolge ?? undefined })
            }}
          />
        </Field>
      </div>
      {report.isError ? (
        <ErrorState
          error={report.error}
          onRetry={() => void report.refetch()}
        />
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.rows.length === 0 ? (
        <EmptyState
          title="Kayıt yok"
          description="Bu dönem ve filtrede sözleşme kapsamında lokasyon bulunamadı."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Taahhüt kadro"
              icon={UsersIcon}
              value={new Intl.NumberFormat("tr-TR").format(
                data.totals.committed
              )}
            />
            <StatCard
              label="Fiili kadro"
              value={new Intl.NumberFormat("tr-TR", {
                maximumFractionDigits: 1,
              }).format(data.totals.actual)}
              tone={gap && gap.difference < 0 ? "warning" : "success"}
            />
            <StatCard
              label="Taahhüt / fiili"
              value={
                <span data-testid="headcount-gap">
                  {gap ? formatHeadcountGap(gap) : "—"}
                </span>
              }
              tone={gap && gap.difference < 0 ? "danger" : "success"}
              hint={monthTitle(month)}
            />
          </div>
          <section aria-labelledby="regions" className="flex flex-col gap-3">
            <h2 id="regions" className="font-heading text-lg font-medium">
              Bölgeler
            </h2>
            <ul className="text-sm">
              {data.regions.map((region) => (
                <li key={region.orgUnitId}>
                  {region.orgUnitName}: taahhüt{" "}
                  {new Intl.NumberFormat("tr-TR").format(region.committed)}{" "}
                  kişi, fiili{" "}
                  {new Intl.NumberFormat("tr-TR", {
                    maximumFractionDigits: 1,
                  }).format(region.actual)}{" "}
                  kişi
                </li>
              ))}
            </ul>
            <RegionTable report={data} />
          </section>
          <section aria-labelledby="locations" className="flex flex-col gap-3">
            <h2 id="locations" className="font-heading text-lg font-medium">
              Lokasyonlar
            </h2>
            <LocationTable
              report={data}
              action={(row) => (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${row.locationName} personel ayrıntısı`}
                  onClick={() => {
                    setTarget({
                      contractId: row.contractId,
                      locationId: row.locationId,
                      name: row.locationName,
                    })
                  }}
                >
                  Personel
                </Button>
              )}
            />
          </section>
        </>
      )}
      <HeadcountLocationSheet
        target={target}
        month={month}
        onClose={() => {
          setTarget(null)
        }}
      />
    </div>
  )
}
