import { useQuery } from "@tanstack/react-query"
import { FileTextIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import {
  CERTIFICATE_LABELS,
  CERTIFICATE_TYPES,
  type CertificateType,
} from "@/entities/location"
import {
  EXPIRY_BUCKETS,
  EXPIRY_BUCKET_LABELS,
  type ExpiryBucket,
} from "@/entities/ohs"
import { Can, useCan } from "@/entities/session"
import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatCard } from "@/shared/components/stat-card"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDate, formatNumber } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"

import { ohsQueries } from "../api/ohs-api"
import {
  CertificateDialog,
  type CertificatePreset,
} from "../components/certificate-dialog"
import { BucketBadge } from "../components/ohs-badges"
import { certificateListParamsSchema, type Certificate } from "../model/ohs"

const helper = createDataTableColumnHelper<Certificate>()

function createColumns(onRenew: ((cert: Certificate) => void) | null) {
  return helper.columns([
    helper.accessor("personnelName", {
      id: "personnelName",
      header: "Personel",
      enableHiding: false,
      cell: ({ row }) => (
        <span className="flex min-w-40 flex-col">
          <Link
            to={paths.personnel.detail(row.original.personnelId)}
            className="font-medium hover:underline"
          >
            {row.original.personnelName}
          </Link>
          <span className="text-xs text-muted-foreground">
            {row.original.employeeNumber}
            {row.original.locationName ? ` · ${row.original.locationName}` : ""}
          </span>
        </span>
      ),
      meta: { label: "Personel" },
    }),
    helper.accessor("type", {
      header: "Sertifika",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span>{CERTIFICATE_LABELS[row.original.type]}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.number}
          </span>
        </span>
      ),
      meta: {
        label: "Sertifika",
        exportValue: (row) => CERTIFICATE_LABELS[row.type],
      },
    }),
    helper.accessor("expiresAt", {
      id: "expiresAt",
      header: "Bitiş",
      cell: (info) => {
        const value = info.getValue()
        return (
          <span className="whitespace-nowrap">
            {value ? formatDate(value) : "Süresiz"}
          </span>
        )
      },
      meta: { label: "Bitiş" },
    }),
    helper.accessor("bucket", {
      header: "Durum",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.superseded ? (
          <StatusBadge tone="neutral">Yenilendi</StatusBadge>
        ) : (
          <BucketBadge bucket={row.original.bucket} />
        ),
      meta: {
        label: "Durum",
        exportValue: (row) =>
          row.superseded
            ? "Yenilendi"
            : row.bucket
              ? EXPIRY_BUCKET_LABELS[row.bucket]
              : "Geçerli",
      },
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">İşlemler</span>,
      cell: ({ row }) => (
        <span className="flex justify-end gap-1">
          {row.original.documentUrl ? (
            <a
              href={row.original.documentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
              aria-label={`${row.original.personnelName} belgesini aç`}
            >
              <FileTextIcon className="size-4" />
            </a>
          ) : null}
          {onRenew && !row.original.superseded ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onRenew(row.original)
              }}
            >
              Yenile
            </Button>
          ) : null}
        </span>
      ),
      meta: { label: "İşlemler" },
    }),
  ])
}

export function CertificatesPage() {
  const canWrite = useCan("ohs:write")
  const [params, setParams, resetParams] = useSearchParamsState(
    certificateListParamsSchema
  )
  const state = {
    ...params,
    sort: params.sort ?? "expiresAt",
    order: params.order ?? "asc",
  }
  const query = useQuery(ohsQueries.certificates(state))
  const summary = useQuery(ohsQueries.certificateSummary())
  const [preset, setPreset] = useState<CertificatePreset | null>(null)
  const columns = createColumns(
    canWrite
      ? (cert) => {
          setPreset({
            personnelId: cert.personnelId,
            personnelName: cert.personnelName,
            type: cert.type,
          })
        }
      : null
  )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sertifikalar"
        description="Bitiş tarihine göre uyarı kovaları. Lokasyonun gerektirdiği sertifikası dolmuş personel vardiyaya atanırken uyarı veya engel çıkar."
        actions={
          <Can permission="ohs:write">
            <Button
              onClick={() => {
                setPreset({})
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Sertifika ekle
            </Button>
          </Can>
        }
      />
      <div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        role="group"
        aria-label="Uyarı kovaları"
      >
        {EXPIRY_BUCKETS.map((bucket) => (
          <button
            key={bucket}
            type="button"
            aria-pressed={params.bucket === bucket}
            onClick={() => {
              setParams({
                bucket: params.bucket === bucket ? undefined : bucket,
                page: 1,
              })
            }}
            className={cn(
              "rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              params.bucket === bucket && "ring-2 ring-primary"
            )}
          >
            <StatCard
              label={EXPIRY_BUCKET_LABELS[bucket]}
              value={formatNumber(summary.data?.buckets[bucket] ?? 0)}
              tone={
                bucket === "expired"
                  ? "danger"
                  : bucket === "d30"
                    ? "warning"
                    : "default"
              }
              isLoading={summary.isPending}
              className="h-full"
            />
          </button>
        ))}
      </div>
      <DataTable
        tableId="isg-sertifikalar"
        caption="Personel sertifikaları"
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
            searchPlaceholder="Personel veya belge no ara…"
            searchLabel="Sertifikalarda ara"
            activeFilterCount={
              [params.bucket, params.type, params.personnelId].filter(Boolean)
                .length
            }
            onReset={resetParams}
          >
            <EnumFilter<ExpiryBucket>
              label="Kova filtresi"
              allLabel="Tüm süreler"
              value={params.bucket}
              options={EXPIRY_BUCKETS}
              labels={EXPIRY_BUCKET_LABELS}
              onChange={(bucket) => {
                setParams({ bucket, page: 1 })
              }}
            />
            <EnumFilter<CertificateType>
              label="Sertifika filtresi"
              allLabel="Tüm sertifikalar"
              value={params.type}
              options={CERTIFICATE_TYPES}
              labels={CERTIFICATE_LABELS}
              onChange={(type) => {
                setParams({ type, page: 1 })
              }}
            />
          </FilterBar>
        }
      />
      <CertificateDialog
        preset={preset}
        onClose={() => {
          setPreset(null)
        }}
      />
    </div>
  )
}
