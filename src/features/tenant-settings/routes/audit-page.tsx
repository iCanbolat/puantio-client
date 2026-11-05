import { useQuery } from "@tanstack/react-query"

import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime } from "@/shared/lib/format"

import { auditQueries } from "../api/tenant-settings-api"
import {
  ACTOR_KIND_LABELS,
  auditListParamsSchema,
  type AuditEvent,
} from "../model/tenant-settings"

const helper = createDataTableColumnHelper<AuditEvent>()
const ACTOR_KINDS = ["user", "platform", "system"] as const

const columns = helper.columns([
  helper.accessor("occurredAt", {
    header: "Zaman",
    enableSorting: false,
    cell: (info) => (
      <span className="whitespace-nowrap tabular-nums">
        {formatDateTime(info.getValue())}
      </span>
    ),
    meta: {
      label: "Zaman",
      exportValue: (row) => formatDateTime(row.occurredAt),
    },
  }),
  helper.accessor("actorName", {
    header: "Kim",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="flex flex-col gap-1">
        <span>{row.original.actorName}</span>
        {row.original.actorKind === "platform" ? (
          <StatusBadge tone="warning">Puantio destek</StatusBadge>
        ) : null}
      </span>
    ),
    meta: { label: "Kim" },
  }),
  helper.accessor("action", {
    header: "İşlem",
    enableSorting: false,
    meta: { label: "İşlem" },
  }),
  helper.accessor("targetLabel", {
    header: "Kayıt",
    enableSorting: false,
    meta: { label: "Kayıt" },
  }),
  helper.accessor("details", {
    header: "Ayrıntı",
    enableSorting: false,
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() ?? "—"}</span>
    ),
    meta: { label: "Ayrıntı" },
  }),
])

/** Kritik değişiklikler ve platform personelinin destek erişimleri. */
export function AuditPage() {
  const [params, setParams, resetParams] = useSearchParamsState(
    auditListParamsSchema
  )
  const query = useQuery(auditQueries.list(params))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Denetim kayıtları"
        description="Rol, kullanıcı, etiket ve ayar değişiklikleri ile Puantio destek ekibinin firmanıza erişimleri."
      />
      <DataTable
        tableId="denetim-kayitlari"
        caption="Denetim kayıtları"
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
        toolbar={
          <FilterBar
            search={params.q}
            onSearchChange={(q) => {
              setParams({ q, page: 1 }, { replace: true })
            }}
            searchPlaceholder="Kişi, işlem veya kayıt ara…"
            searchLabel="Denetim kayıtlarında ara"
            activeFilterCount={params.actorKind ? 1 : 0}
            onReset={resetParams}
          >
            <EnumFilter
              label="Kaynak filtresi"
              allLabel="Tüm kaynaklar"
              value={params.actorKind}
              options={ACTOR_KINDS}
              labels={ACTOR_KIND_LABELS}
              onChange={(actorKind) => {
                setParams({ actorKind, page: 1 })
              }}
            />
          </FilterBar>
        }
      />
    </div>
  )
}
