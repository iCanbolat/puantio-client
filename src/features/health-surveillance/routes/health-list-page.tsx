import { useQuery } from "@tanstack/react-query"
import { EyeIcon, ScrollTextIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button, buttonVariants } from "@/shared/ui/button"

import { healthQueries } from "../api/health-api"
import { HealthDueBadge, HealthRecordDialog } from "../components/health-ui"
import {
  HEALTH_DUE_LABELS,
  HEALTH_DUE_STATES,
  healthListParamsSchema,
  type HealthDue,
  type HealthListRow,
} from "../model/health"

const monthFormatter = new Intl.DateTimeFormat("tr-TR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})
const monthLabel = (month: string | null) =>
  month ? monthFormatter.format(new Date(`${month}-01T00:00:00Z`)) : "—"

const helper = createDataTableColumnHelper<HealthListRow>()

function createColumns(onReveal: (row: HealthListRow) => void) {
  return helper.columns([
    helper.accessor("name", {
      header: "Personel",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="flex min-w-40 flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.employeeNumber}
            {row.original.locationName ? ` · ${row.original.locationName}` : ""}
          </span>
        </span>
      ),
      meta: { label: "Personel" },
    }),
    helper.accessor("nextExamMonth", {
      header: "Sonraki muayene",
      enableSorting: false,
      cell: (info) => monthLabel(info.getValue()),
      meta: { label: "Sonraki muayene" },
    }),
    helper.accessor("due", {
      header: "Durum",
      enableSorting: false,
      cell: (info) => <HealthDueBadge due={info.getValue()} />,
      meta: { label: "Durum" },
    }),
    helper.display({
      id: "reveal",
      header: () => <span className="sr-only">Göster</span>,
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          aria-label={`${row.original.name} sağlık kaydını göster`}
          onClick={() => {
            onReveal(row.original)
          }}
        >
          <EyeIcon data-icon="inline-start" />
          Göster
        </Button>
      ),
      meta: { label: "Göster", align: "right" },
    }),
  ])
}

export function HealthListPage() {
  const [params, setParams, resetParams] = useSearchParamsState(
    healthListParamsSchema
  )
  const query = useQuery(healthQueries.list(params))
  const [target, setTarget] = useState<{
    personnelId: string
    name: string
  } | null>(null)
  const columns = createColumns((row) => {
    setTarget({ personnelId: row.personnelId, name: row.name })
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sağlık gözetimi"
        description="Periyodik muayene takibi. Liste maskelidir: sonuç ve tarihler yalnızca gerekçeyle görüntülenir ve her görüntüleme erişim kaydına yazılır."
        actions={
          <Link
            to={paths.ohs.healthAccess()}
            className={buttonVariants({ variant: "outline" })}
          >
            <ScrollTextIcon data-icon="inline-start" />
            Erişim kayıtları
          </Link>
        }
      />
      <Alert>
        <AlertDescription>
          Özel nitelikli kişisel veri (KVKK md. 6). Tanı bilgisi tutulmaz; bu
          sayfa dışa aktarılamaz.
        </AlertDescription>
      </Alert>
      <DataTable
        tableId="saglik-gozetimi"
        caption="Periyodik muayene durumu (maskeli)"
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        state={params}
        onStateChange={(patch) => {
          setParams(patch)
        }}
        getRowId={(row) => row.personnelId}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        toolbar={
          <FilterBar
            search={params.q}
            onSearchChange={(q) => {
              setParams({ q, page: 1 }, { replace: true })
            }}
            searchPlaceholder="Ad veya sicil ara…"
            searchLabel="Personel ara"
            activeFilterCount={params.due ? 1 : 0}
            onReset={resetParams}
          >
            <EnumFilter<HealthDue>
              label="Muayene durumu filtresi"
              allLabel="Tüm durumlar"
              value={params.due}
              options={HEALTH_DUE_STATES}
              labels={HEALTH_DUE_LABELS}
              onChange={(due) => {
                setParams({ due, page: 1 })
              }}
            />
          </FilterBar>
        }
      />
      <HealthRecordDialog
        target={target}
        onClose={() => {
          setTarget(null)
        }}
      />
    </div>
  )
}
