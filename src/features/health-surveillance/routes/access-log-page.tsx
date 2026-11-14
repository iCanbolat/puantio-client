import { useQuery } from "@tanstack/react-query"

import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime } from "@/shared/lib/format"
import { listParamsSchema } from "@/shared/types"

import { healthQueries } from "../api/health-api"
import { ACCESS_ACTION_LABELS, type AccessLogRow } from "../model/health"

const helper = createDataTableColumnHelper<AccessLogRow>()

const columns = helper.columns([
  helper.accessor("occurredAt", {
    header: "Zaman",
    enableSorting: false,
    cell: (info) => (
      <span className="whitespace-nowrap">
        {formatDateTime(info.getValue())}
      </span>
    ),
    meta: { label: "Zaman" },
  }),
  helper.accessor("actorName", {
    header: "Kullanıcı",
    enableSorting: false,
    meta: { label: "Kullanıcı" },
  }),
  helper.accessor("personnelName", {
    header: "Personel",
    enableSorting: false,
    meta: { label: "Personel" },
  }),
  helper.accessor("action", {
    header: "İşlem",
    enableSorting: false,
    cell: (info) => ACCESS_ACTION_LABELS[info.getValue()],
    meta: { label: "İşlem" },
  }),
  helper.accessor("reason", {
    header: "Gerekçe",
    enableSorting: false,
    cell: (info) => <span className="block min-w-48">{info.getValue()}</span>,
    meta: { label: "Gerekçe" },
  }),
])

export function AccessLogPage() {
  const [params, setParams, resetParams] =
    useSearchParamsState(listParamsSchema)
  const query = useQuery(healthQueries.accessLogs(params))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sağlık verisi erişim kayıtları"
        description="Kim, ne zaman, kimin sağlık verisini hangi gerekçeyle görüntüledi veya güncelledi."
      />
      <DataTable
        tableId="saglik-erisim"
        caption="Sağlık verisi erişim kayıtları"
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
        toolbar={
          <FilterBar
            search={params.q}
            onSearchChange={(q) => {
              setParams({ q, page: 1 }, { replace: true })
            }}
            searchPlaceholder="Kullanıcı, personel veya gerekçe ara…"
            searchLabel="Erişim kayıtlarında ara"
            activeFilterCount={0}
            onReset={resetParams}
          />
        }
      />
    </div>
  )
}
