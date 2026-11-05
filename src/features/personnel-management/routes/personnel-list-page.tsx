import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useMemo } from "react"
import { Link } from "react-router"

import { LocationCombobox } from "@/entities/location"
import { OrgUnitSelect } from "@/entities/org-unit"
import {
  PERSONNEL_STATUSES,
  PERSONNEL_STATUS_LABELS,
  POSITIONS,
  POSITION_LABELS,
  personnelFullName,
  personnelListParamsSchema,
  personnelQueries,
  type Personnel,
  type PersonnelStatus,
  type Position,
} from "@/entities/personnel"
import { Can } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import {
  DataTable,
  DataTableColumnHeader,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDate } from "@/shared/lib/format"
import { buttonVariants } from "@/shared/ui/button"

import { STATUS_TONES } from "../components/personnel-status"

const helper = createDataTableColumnHelper<Personnel>()

function createColumns(labels: { location: string; orgUnit: string }) {
  return helper.columns([
    helper.accessor("employeeNumber", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Sicil" />
      ),
      cell: (info) => (
        <span className="font-mono text-xs">{info.getValue()}</span>
      ),
      meta: { label: "Sicil" },
      enableHiding: false,
    }),
    helper.accessor("lastName", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Ad soyad" />
      ),
      cell: ({ row }) => (
        <span className="flex min-w-48 flex-col">
          <Link
            to={paths.personnel.detail(row.original.id)}
            className="font-medium hover:underline"
          >
            {personnelFullName(row.original)}
          </Link>
          <span className="text-xs text-muted-foreground">
            {POSITION_LABELS[row.original.position]}
            {row.original.isFloater ? " · Yedek havuzu" : ""}
          </span>
        </span>
      ),
      meta: { label: "Ad soyad", exportValue: (row) => personnelFullName(row) },
    }),
    helper.accessor("tcknMasked", {
      header: "T.C. Kimlik No",
      enableSorting: false,
      cell: (info) => (
        <span className="font-mono text-xs">{info.getValue()}</span>
      ),
      meta: { label: "T.C. Kimlik No" },
    }),
    helper.accessor("phoneMasked", {
      header: "Telefon",
      enableSorting: false,
      cell: (info) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {info.getValue() ?? "—"}
        </span>
      ),
      meta: { label: "Telefon" },
    }),
    helper.accessor("homeLocationName", {
      header: labels.location,
      enableSorting: false,
      cell: (info) => (
        <span className="block max-w-64 truncate">
          {info.getValue() ?? "—"}
        </span>
      ),
      meta: { label: labels.location },
    }),
    helper.accessor("orgUnitName", {
      header: labels.orgUnit,
      enableSorting: false,
      cell: (info) => info.getValue() ?? "—",
      meta: { label: labels.orgUnit },
    }),
    helper.accessor("legalEntityName", {
      header: "İşveren",
      enableSorting: false,
      cell: (info) => (
        <span className="block max-w-48 truncate">{info.getValue()}</span>
      ),
      meta: { label: "İşveren" },
    }),
    helper.accessor("status", {
      header: "Durum",
      enableSorting: false,
      cell: (info) => (
        <StatusBadge tone={STATUS_TONES[info.getValue()]}>
          {PERSONNEL_STATUS_LABELS[info.getValue()]}
        </StatusBadge>
      ),
      meta: {
        label: "Durum",
        exportValue: (row) => PERSONNEL_STATUS_LABELS[row.status],
      },
    }),
    helper.accessor("hireDate", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="İşe giriş" />
      ),
      cell: (info) => (
        <span className="tabular-nums">{formatDate(info.getValue())}</span>
      ),
      meta: {
        label: "İşe giriş",
        exportValue: (row) => formatDate(row.hireDate),
      },
    }),
  ])
}

export function PersonnelListPage() {
  const terms = useTerms()
  const [params, setParams, resetParams] = useSearchParamsState(
    personnelListParamsSchema
  )
  const query = useQuery(personnelQueries.list(params))
  const orgUnitLabel = terms.orgLevels.at(-1)?.singular ?? "Bölge"
  const columns = useMemo(
    () =>
      createColumns({
        location: terms.location.singular,
        orgUnit: orgUnitLabel,
      }),
    [terms.location.singular, orgUnitLabel]
  )
  const activeFilterCount = [
    params.orgUnitId,
    params.locationId,
    params.status,
    params.position,
  ].filter(Boolean).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Personel"
        description="Saha ve merkez personeli. T.C. Kimlik No ve telefon listede maskeli gösterilir (KVKK)."
        actions={
          <Can permission="personnel:write">
            <Link to={paths.personnel.new()} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              Yeni personel
            </Link>
          </Can>
        }
      />
      <DataTable
        tableId="personel"
        caption="Personel listesi"
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        state={params}
        onStateChange={(patch) => {
          setParams(patch)
        }}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        enableCsvExport
        virtualized={
          params.pageSize >= 50
            ? { height: 640, estimateRowHeight: 56 }
            : undefined
        }
        toolbar={
          <FilterBar
            search={params.q}
            onSearchChange={(q) => {
              setParams({ q, page: 1 }, { replace: true })
            }}
            searchPlaceholder="Ad, soyad veya sicil ara…"
            searchLabel="Personelde ara"
            activeFilterCount={activeFilterCount}
            onReset={resetParams}
          >
            <OrgUnitSelect
              allowAll
              value={params.orgUnitId ?? null}
              onValueChange={(orgUnitId) => {
                setParams({ orgUnitId: orgUnitId ?? undefined, page: 1 })
              }}
              className="h-8 w-48"
              aria-label={`${terms.orgLevels[0]?.singular ?? "Bölge"} filtresi`}
            />
            <LocationCombobox
              aria-label={`${terms.location.singular} filtresi`}
              value={params.locationId ?? null}
              onValueChange={(locationId) => {
                setParams({ locationId: locationId ?? undefined, page: 1 })
              }}
              className="w-56"
            />
            <EnumFilter<PersonnelStatus>
              label="Durum filtresi"
              allLabel="Tüm durumlar"
              value={params.status}
              options={PERSONNEL_STATUSES}
              labels={PERSONNEL_STATUS_LABELS}
              onChange={(status) => {
                setParams({ status, page: 1 })
              }}
              className="w-36"
            />
            <EnumFilter<Position>
              label="Pozisyon filtresi"
              allLabel="Tüm pozisyonlar"
              value={params.position}
              options={POSITIONS}
              labels={POSITION_LABELS}
              onChange={(position) => {
                setParams({ position, page: 1 })
              }}
              className="w-48"
            />
          </FilterBar>
        }
      />
    </div>
  )
}
