import { useMutation, useQuery } from "@tanstack/react-query"
import { DownloadIcon } from "lucide-react"
import { Link } from "react-router"

import { OrgUnitSelect } from "@/entities/org-unit"
import { useTerms } from "@/entities/tenant"
import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { Button } from "@/shared/ui/button"
import { Spinner } from "@/shared/ui/spinner"

import {
  downloadMissingReport,
  personnelFileQueries,
} from "../api/personnel-file-api"
import { CompletionBar } from "../components/file-ui"
import {
  personnelFileListParamsSchema,
  type PersonnelFileRow,
} from "../model/personnel-file"

const helper = createDataTableColumnHelper<PersonnelFileRow>()

const columns = helper.columns([
  helper.accessor("name", {
    header: "Personel",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <span className="flex min-w-40 flex-col">
        <Link
          to={`${paths.personnel.detail(row.original.personnelId)}?sekme=ozluk`}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
        <span className="text-xs text-muted-foreground">
          {row.original.employeeNumber}
          {row.original.locationName ? ` · ${row.original.locationName}` : ""}
        </span>
      </span>
    ),
    meta: { label: "Personel" },
  }),
  helper.accessor("completion", {
    header: "Tamamlanma",
    enableSorting: false,
    cell: ({ row }) => (
      <CompletionBar
        value={row.original.completion}
        label={`${row.original.name} özlük tamamlanma`}
      />
    ),
    meta: { label: "Tamamlanma", exportValue: (row) => `%${row.completion}` },
  }),
  helper.accessor("missing", {
    header: "Eksik belgeler",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block min-w-48 text-sm">
        {row.original.missing.length || row.original.expired.length ? (
          <>
            {row.original.missing.join(", ")}
            {row.original.expired.length ? (
              <span className="text-amber-800 dark:text-amber-400">
                {row.original.missing.length ? " · " : ""}
                Süresi geçmiş: {row.original.expired.join(", ")}
              </span>
            ) : null}
          </>
        ) : (
          "—"
        )}
      </span>
    ),
    meta: {
      label: "Eksik belgeler",
      exportValue: (row) => [...row.missing, ...row.expired].join(", "),
    },
  }),
])

export function PersonnelFilesPage() {
  const terms = useTerms()
  const [params, setParams, resetParams] = useSearchParamsState(
    personnelFileListParamsSchema
  )
  const query = useQuery(personnelFileQueries.list(params))
  const download = useMutation({
    mutationFn: () =>
      downloadMissingReport({
        orgUnitId: params.orgUnitId,
        durum: params.durum,
        q: params.q,
      }),
    meta: { successMessage: "Eksik belge raporu indirildi" },
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dijital özlük dosyaları"
        description="Belge kontrol listesine göre tamamlanma ve eksik belge raporu. En eksik dosyalar üstte."
        actions={
          <Button
            variant="outline"
            disabled={download.isPending}
            onClick={() => {
              download.mutate()
            }}
          >
            {download.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            Eksik belge raporu (Excel)
          </Button>
        }
      />
      <DataTable
        tableId="ozluk-dosyalari"
        caption="Özlük dosyası tamamlanma durumu"
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
            activeFilterCount={
              [params.durum, params.orgUnitId].filter(Boolean).length
            }
            onReset={resetParams}
          >
            <EnumFilter<"eksik" | "tamam">
              label="Dosya durumu filtresi"
              allLabel="Tüm dosyalar"
              value={params.durum}
              options={["eksik", "tamam"] as const}
              labels={{ eksik: "Eksik belgeli", tamam: "Tamamlanmış" }}
              onChange={(durum) => {
                setParams({ durum, page: 1 })
              }}
            />
            <OrgUnitSelect
              allowAll
              aria-label={`${terms.orgLevels[0]?.singular ?? "Bölge"} filtresi`}
              value={params.orgUnitId ?? null}
              onValueChange={(orgUnitId) => {
                setParams({ orgUnitId: orgUnitId ?? undefined, page: 1 })
              }}
              className="w-full sm:w-52"
            />
          </FilterBar>
        }
      />
    </div>
  )
}
