import { useQuery } from "@tanstack/react-query"

import { POSITION_LABELS } from "@/entities/personnel"
import { ErrorState } from "@/shared/components/error-state"
import { formatDate } from "@/shared/lib/format"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet"
import { Skeleton } from "@/shared/ui/skeleton"

import { contractDetailQueries } from "../api/contracts-api"
import { formatHeadcountGap, headcountGap } from "../domain/headcount"
import { monthTitle } from "../lib/months"

const shortDate = (date: string) => formatDate(date).slice(0, 5)

/** Lokasyona iniş: personel bazında çalışılan ve eksik günler (TC-3.2-02) */
export function HeadcountLocationSheet({
  target,
  month,
  onClose,
}: {
  target: { contractId: string; locationId: string; name: string } | null
  month: string
  onClose: () => void
}) {
  const query = useQuery({
    ...contractDetailQueries.headcountLocation(
      target?.contractId ?? "",
      target?.locationId ?? "",
      month
    ),
    enabled: target !== null,
  })
  const detail = query.data
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{target?.name ?? "Lokasyon"}</SheetTitle>
          <SheetDescription>
            {detail
              ? `${monthTitle(month)} · ${formatHeadcountGap(headcountGap(detail.committed, detail.actual))} · ${detail.plannedDates.length} planlı iş günü`
              : "Yükleniyor…"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {query.isError ? (
            <ErrorState
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : !detail ? (
            <Skeleton className="h-40 w-full" />
          ) : detail.personnel.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bu lokasyonda bu dönem çalışan personel yok.
            </p>
          ) : (
            <ul
              className="flex flex-col divide-y"
              aria-label="Personel ve eksik günler"
            >
              {detail.personnel.map((person) => (
                <li
                  key={person.personnelId}
                  className="flex flex-col gap-1 py-2"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{person.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {POSITION_LABELS[person.position]} ·{" "}
                      {new Intl.NumberFormat("tr-TR").format(person.workedDays)}{" "}
                      gün çalıştı
                    </span>
                  </span>
                  {person.missing.length > 0 ? (
                    <span className="text-sm text-destructive">
                      Eksik {person.missing.length} gün:{" "}
                      {person.missing
                        .map(
                          (day) =>
                            `${shortDate(day.date)}${day.code ? ` (${day.code})` : ""}`
                        )
                        .join(", ")}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Eksik gün yok
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
