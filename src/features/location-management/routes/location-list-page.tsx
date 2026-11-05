import { useQuery } from "@tanstack/react-query"
import { ListIcon, MapIcon, PlusIcon, PrinterIcon } from "lucide-react"
import { useMemo } from "react"
import { Link, useNavigate } from "react-router"

import { CustomerCombobox } from "@/entities/customer"
import {
  LOCATION_STATUSES,
  LOCATION_STATUS_LABELS,
  locationListParamsSchema,
  locationQueries,
  type Location,
  type LocationStatus,
} from "@/entities/location"
import { OrgUnitSelect } from "@/entities/org-unit"
import { Can } from "@/entities/session"
import {
  SERVICE_LINE_LABELS,
  useTenant,
  useTerms,
  type ServiceLine,
} from "@/entities/tenant"
import { ClusterMapLazy } from "@/shared/components/cluster-map"
import {
  DataTable,
  DataTableColumnHeader,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { ErrorState } from "@/shared/components/error-state"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatNumber } from "@/shared/lib/format"
import { Button, buttonVariants } from "@/shared/ui/button"

const helper = createDataTableColumnHelper<Location>()

function createColumns(orgLabel: string) {
  return helper.columns([
    helper.accessor("code", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Kod" />
      ),
      cell: (info) => (
        <span className="font-mono text-xs">{info.getValue()}</span>
      ),
      meta: { label: "Kod" },
      enableHiding: false,
    }),
    helper.accessor("name", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Ad" />
      ),
      cell: ({ row }) => (
        <span className="flex min-w-56 flex-col">
          <Link
            to={paths.locations.detail(row.original.id)}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {row.original.customerName}
          </span>
        </span>
      ),
      meta: { label: "Ad" },
    }),
    helper.accessor("orgUnitName", {
      header: orgLabel,
      enableSorting: false,
      meta: { label: orgLabel },
    }),
    helper.accessor((row) => row.address.city, {
      id: "city",
      header: "İl",
      enableSorting: false,
      meta: { label: "İl" },
    }),
    helper.accessor("serviceLines", {
      header: "Hizmet",
      enableSorting: false,
      cell: (info) =>
        info
          .getValue()
          .map((line) => SERVICE_LINE_LABELS[line])
          .join(", "),
      meta: {
        label: "Hizmet",
        exportValue: (row) =>
          row.serviceLines.map((line) => SERVICE_LINE_LABELS[line]).join(", "),
      },
    }),
    helper.accessor("targetHeadcount", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Hedef kadro" />
      ),
      cell: (info) => (
        <span className="tabular-nums">{formatNumber(info.getValue())}</span>
      ),
      meta: { label: "Hedef kadro", align: "right" },
    }),
    helper.accessor("areaCount", {
      header: "Alan",
      enableSorting: false,
      cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
      meta: { label: "Alan", align: "right" },
    }),
    helper.accessor("status", {
      header: "Durum",
      enableSorting: false,
      cell: (info) => (
        <StatusBadge
          tone={info.getValue() === "active" ? "success" : "neutral"}
        >
          {LOCATION_STATUS_LABELS[info.getValue()]}
        </StatusBadge>
      ),
      meta: {
        label: "Durum",
        exportValue: (row) => LOCATION_STATUS_LABELS[row.status],
      },
    }),
  ])
}

function LocationMap({
  filters,
}: {
  filters: Parameters<typeof locationQueries.mapPoints>[0]
}) {
  const terms = useTerms()
  const navigate = useNavigate()
  const query = useQuery(locationQueries.mapPoints(filters))
  const points = useMemo(
    () =>
      (query.data ?? []).map((point) => ({
        id: point.id,
        lat: point.lat,
        lng: point.lng,
        label: `${point.code} · ${point.name}`,
      })),
    [query.data]
  )
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {query.isPending
          ? "Harita verisi yükleniyor…"
          : `${formatNumber(points.length)} ${terms.lower(terms.location)} haritada. Kümeye tıklayınca yakınlaşır.`}
      </p>
      <ClusterMapLazy
        points={points}
        label={`${terms.location.plural} haritası`}
        onSelect={(id) => void navigate(paths.locations.detail(id))}
      />
    </div>
  )
}

export function LocationListPage() {
  const tenant = useTenant()
  const terms = useTerms()
  const [params, setParams, resetParams] = useSearchParamsState(
    locationListParamsSchema
  )
  const { gorunum, ...filters } = params
  const query = useQuery({
    ...locationQueries.list(filters),
    enabled: gorunum === "liste",
  })
  const orgLabel = terms.orgLevels.at(-1)?.singular ?? "Bölge"
  const columns = useMemo(() => createColumns(orgLabel), [orgLabel])
  const activeFilterCount = [
    params.orgUnitId,
    params.customerId,
    params.status,
    params.serviceLine,
  ].filter(Boolean).length
  const {
    page: _page,
    pageSize: _pageSize,
    sort: _sort,
    order: _order,
    ...mapFilters
  } = filters

  const toolbar = (
    <FilterBar
      search={params.q}
      onSearchChange={(q) => {
        setParams({ q, page: 1 }, { replace: true })
      }}
      searchPlaceholder="Kod veya ad ara…"
      searchLabel={`${terms.location.plural} içinde ara`}
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
      <CustomerCombobox
        aria-label="Müşteri filtresi"
        value={params.customerId ?? null}
        onValueChange={(customerId) => {
          setParams({ customerId: customerId ?? undefined, page: 1 })
        }}
        className="w-52"
      />
      <EnumFilter<LocationStatus>
        label="Durum filtresi"
        allLabel="Tüm durumlar"
        value={params.status}
        options={LOCATION_STATUSES}
        labels={LOCATION_STATUS_LABELS}
        onChange={(status) => {
          setParams({ status, page: 1 })
        }}
        className="w-36"
      />
      {tenant.serviceLines.length > 1 ? (
        <EnumFilter<ServiceLine>
          label="Hizmet hattı filtresi"
          allLabel="Tüm hizmetler"
          value={params.serviceLine}
          options={tenant.serviceLines}
          labels={SERVICE_LINE_LABELS}
          onChange={(serviceLine) => {
            setParams({ serviceLine, page: 1 })
          }}
        />
      ) : null}
    </FilterBar>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={terms.location.plural}
        description={`Müşteri sahaları, geofence ve ${terms.lower(terms.area, true)}. QR/NFC etiketleri buradan yönetilir.`}
        actions={
          <>
            <div
              className="flex rounded-xl border p-0.5"
              role="group"
              aria-label="Görünüm"
            >
              <Button
                size="sm"
                variant={gorunum === "liste" ? "secondary" : "ghost"}
                aria-pressed={gorunum === "liste"}
                onClick={() => {
                  setParams({ gorunum: "liste" })
                }}
              >
                <ListIcon data-icon="inline-start" />
                Liste
              </Button>
              <Button
                size="sm"
                variant={gorunum === "harita" ? "secondary" : "ghost"}
                aria-pressed={gorunum === "harita"}
                onClick={() => {
                  setParams({ gorunum: "harita" })
                }}
              >
                <MapIcon data-icon="inline-start" />
                Harita
              </Button>
            </div>
            <Can permission="location:write">
              <Link to={paths.locations.new()} className={buttonVariants()}>
                <PlusIcon data-icon="inline-start" />
                Yeni {terms.lower(terms.location)}
              </Link>
            </Can>
          </>
        }
      />
      {gorunum === "harita" ? (
        <>
          {toolbar}
          <LocationMap filters={mapFilters} />
        </>
      ) : (
        <DataTable
          tableId="lokasyonlar"
          caption={terms.location.plural}
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
          enableRowSelection
          renderBulkActions={({ selectedIds }) => (
            <Link
              to={paths.tagPrint(selectedIds)}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <PrinterIcon data-icon="inline-start" />
              QR etiketlerini bas ({selectedIds.length})
            </Link>
          )}
          toolbar={toolbar}
        />
      )}
    </div>
  )
}
