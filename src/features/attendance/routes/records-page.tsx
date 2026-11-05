import { useQuery } from "@tanstack/react-query"
import { CloudOffIcon, PencilIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { LocationCombobox } from "@/entities/location"
import { OrgUnitSelect } from "@/entities/org-unit"
import { useCan } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import {
  DataTable,
  createDataTableColumnHelper,
} from "@/shared/components/data-table"
import { DateRangePicker } from "@/shared/components/date-range-picker"
import { EnumFilter } from "@/shared/components/enum-filter"
import { FilterBar } from "@/shared/components/filter-bar"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDate, formatTime } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"

import { attendanceQueries } from "../api/attendance-api"
import { AnomalyBadges } from "../components/attendance-ui"
import { CorrectionDialog } from "../components/correction-dialog"
import {
  ANOMALY_CODES,
  ANOMALY_LABELS,
  attendanceRecordParamsSchema,
  type AnomalyCode,
  type AttendanceEvent,
  type AttendanceRecord,
} from "../model/attendance"

const helper = createDataTableColumnHelper<AttendanceRecord>()

function EventCell({ event }: { event: AttendanceEvent | null }) {
  if (!event) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-col text-xs tabular-nums">
      <span className="text-sm font-medium">
        {formatTime(event.deviceTime)}
      </span>
      {event.offline ? (
        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <CloudOffIcon className="size-3" aria-hidden />
          ulaştı {formatTime(event.receivedAt)}
        </span>
      ) : null}
    </span>
  )
}

function createColumns(actions: {
  canCorrect: boolean
  onCorrect: (record: AttendanceRecord) => void
}) {
  return helper.columns([
    helper.accessor("date", {
      header: "Tarih",
      enableSorting: false,
      cell: (info) => (
        <span className="tabular-nums">{formatDate(info.getValue())}</span>
      ),
      meta: { label: "Tarih", exportValue: (row) => formatDate(row.date) },
    }),
    helper.accessor("personnelName", {
      header: "Personel",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex min-w-40 flex-col">
          <span className="font-medium">{row.original.personnelName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {row.original.locationName}
          </span>
        </span>
      ),
      meta: { label: "Personel" },
    }),
    helper.accessor("startsAt", {
      header: "Vardiya",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatTime(row.original.startsAt)}–{formatTime(row.original.endsAt)}
        </span>
      ),
      meta: {
        label: "Vardiya",
        exportValue: (row) =>
          `${formatTime(row.startsAt)}-${formatTime(row.endsAt)}`,
      },
    }),
    helper.accessor("checkIn", {
      header: "Giriş (cihaz)",
      enableSorting: false,
      cell: (info) => <EventCell event={info.getValue()} />,
      meta: {
        label: "Giriş",
        exportValue: (row) =>
          row.checkIn ? formatTime(row.checkIn.deviceTime) : "",
      },
    }),
    helper.accessor("checkOut", {
      header: "Çıkış (cihaz)",
      enableSorting: false,
      cell: (info) => <EventCell event={info.getValue()} />,
      meta: {
        label: "Çıkış",
        exportValue: (row) =>
          row.checkOut ? formatTime(row.checkOut.deviceTime) : "",
      },
    }),
    helper.accessor("anomalies", {
      header: "Anomaliler",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-col gap-1">
          <AnomalyBadges anomalies={row.original.anomalies} />
          {row.original.corrected ? (
            <StatusBadge tone="info">Düzeltildi</StatusBadge>
          ) : null}
        </span>
      ),
      meta: {
        label: "Anomaliler",
        exportValue: (row) =>
          row.anomalies
            .map((anomaly) => ANOMALY_LABELS[anomaly.code])
            .join(", "),
      },
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">İşlemler</span>,
      cell: ({ row }) =>
        actions.canCorrect ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              actions.onCorrect(row.original)
            }}
            aria-label={`${row.original.personnelName} ${formatDate(row.original.date)} yoklamasını düzelt`}
          >
            <PencilIcon data-icon="inline-start" />
            Düzelt
          </Button>
        ) : null,
      enableHiding: false,
    }),
  ])
}

export function RecordsPage() {
  const terms = useTerms()
  const [params, setParams, resetParams] = useSearchParamsState(
    attendanceRecordParamsSchema
  )
  const query = useQuery(attendanceQueries.records(params))
  const canCorrect = useCan("attendance:correct")
  const [editing, setEditing] = useState<AttendanceRecord | null>(null)
  const columns = useMemo(
    () => createColumns({ canCorrect, onCorrect: setEditing }),
    [canCorrect]
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Yoklama kayıtları"
        description="Giriş-çıkış logu ve anomaliler. Kayıtlar cihaz zamanına göre sıralıdır; çevrimdışı kaydedilip geç ulaşanlar doğru yerinde görünür."
      />
      <DataTable
        tableId="yoklama-kayitlari"
        caption="Yoklama kayıtları"
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        state={params}
        onStateChange={(patch) => {
          setParams(patch)
        }}
        getRowId={(row) => row.shiftId}
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
            searchPlaceholder="Personel veya lokasyon ara…"
            searchLabel="Kayıtlarda ara"
            activeFilterCount={
              [
                params.orgUnitId,
                params.locationId,
                params.anomaly,
                params.from,
              ].filter(Boolean).length
            }
            onReset={resetParams}
          >
            <DateRangePicker
              label="Tarih aralığı"
              value={{ from: params.from, to: params.to }}
              onChange={(range) => {
                setParams({ from: range.from, to: range.to, page: 1 })
              }}
            />
            <OrgUnitSelect
              allowAll
              value={params.orgUnitId ?? null}
              onValueChange={(orgUnitId) => {
                setParams({ orgUnitId: orgUnitId ?? undefined, page: 1 })
              }}
              className="h-8 w-44"
              aria-label={`${terms.orgLevels[0]?.singular ?? "Bölge"} filtresi`}
            />
            <LocationCombobox
              aria-label={`${terms.location.singular} filtresi`}
              value={params.locationId ?? null}
              onValueChange={(locationId) => {
                setParams({ locationId: locationId ?? undefined, page: 1 })
              }}
              className="w-52"
            />
            <EnumFilter<AnomalyCode>
              label="Anomali filtresi"
              allLabel="Tüm kayıtlar"
              value={params.anomaly}
              options={ANOMALY_CODES}
              labels={ANOMALY_LABELS}
              onChange={(anomaly) => {
                setParams({ anomaly, page: 1 })
              }}
              className="w-44"
            />
          </FilterBar>
        }
      />
      <CorrectionDialog
        record={editing}
        onClose={() => {
          setEditing(null)
        }}
      />
    </div>
  )
}
