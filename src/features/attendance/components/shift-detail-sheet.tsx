import { useQuery } from "@tanstack/react-query"
import { CloudOffIcon, MapPinIcon } from "lucide-react"

import { DetailList } from "@/shared/components/detail-list"
import { ErrorState } from "@/shared/components/error-state"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatDateTime, formatDuration, formatTime } from "@/shared/lib/format"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet"
import { Skeleton } from "@/shared/ui/skeleton"

import { attendanceQueries } from "../api/attendance-api"
import {
  ATTENDANCE_STATUS_LABELS,
  CHECK_METHOD_LABELS,
  type AttendanceEvent,
} from "../model/attendance"
import { ATTENDANCE_STATUS_TONES } from "./attendance-format"
import { AnomalyBadges } from "./attendance-ui"

function EventCard({ event }: { event: AttendanceEvent }) {
  const delay = Date.parse(event.receivedAt) - Date.parse(event.deviceTime)
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">
          {event.kind === "in" ? "Giriş" : "Çıkış"}
        </span>
        <span className="text-sm text-muted-foreground">
          {CHECK_METHOD_LABELS[event.method]}
        </span>
        {event.corrected ? (
          <StatusBadge tone="info">Elle düzeltildi</StatusBadge>
        ) : null}
        {event.offline ? (
          <StatusBadge tone="warning" className="ml-auto">
            <CloudOffIcon className="size-3" aria-hidden />
            Çevrimdışı kayıt
          </StatusBadge>
        ) : null}
      </div>
      <DetailList
        className="sm:grid-cols-2 lg:grid-cols-2"
        items={[
          { label: "Cihaz zamanı", value: formatDateTime(event.deviceTime) },
          {
            label: "Sunucu zamanı (ulaştı)",
            value: formatDateTime(event.receivedAt),
          },
          ...(event.offline
            ? [
                {
                  label: "Senkron gecikmesi",
                  value: formatDuration(Math.max(0, delay)),
                },
              ]
            : []),
          {
            label: "Geofence",
            value: (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden />
                {event.geofence.inside ? "İçeride" : "Dışarıda"} ·{" "}
                {Math.round(event.geofence.distanceMeters).toLocaleString(
                  "tr-TR"
                )}{" "}
                m
              </span>
            ),
          },
        ]}
      />
      {event.photoUrl ? (
        <img
          src={event.photoUrl}
          alt={`${event.kind === "in" ? "Giriş" : "Çıkış"} fotoğrafı, ${formatTime(event.deviceTime)}`}
          referrerPolicy="no-referrer"
          className="h-36 w-48 rounded-md border object-cover"
        />
      ) : null}
    </li>
  )
}

/** Check-in detay çekmecesi: saat, yöntem, geofence, fotoğraf, offline senkron */
export function ShiftDetailSheet({
  shiftId,
  onClose,
}: {
  shiftId: string | null
  onClose: () => void
}) {
  const query = useQuery({
    ...attendanceQueries.shift(shiftId ?? ""),
    enabled: shiftId !== null,
  })
  const detail = query.data
  return (
    <Sheet
      open={shiftId !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {detail?.personnelName ?? "Vardiya ayrıntısı"}
          </SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.locationName} · ${formatTime(detail.startsAt)}–${formatTime(detail.endsAt)}`
              : "Yükleniyor…"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {query.isError ? (
            <ErrorState
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : !detail ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={ATTENDANCE_STATUS_TONES[detail.status]}>
                  {ATTENDANCE_STATUS_LABELS[detail.status]}
                </StatusBadge>
                {detail.lateMinutes > 0 ? (
                  <span className="text-sm text-muted-foreground">
                    {detail.lateMinutes} dk geç
                  </span>
                ) : null}
              </div>
              <AnomalyBadges anomalies={detail.anomalies} />
              {detail.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Henüz giriş/çıkış kaydı yok.
                </p>
              ) : (
                <ul
                  className="flex flex-col gap-3"
                  aria-label="Giriş ve çıkış kayıtları"
                >
                  {detail.events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
