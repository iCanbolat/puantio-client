import { CameraIcon, QrCodeIcon } from "lucide-react"
import type { ReactNode } from "react"

import { DetailList } from "@/shared/components/detail-list"
import { formatDateTime } from "@/shared/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"

import {
  WORK_ORDER_SOURCE_LABELS,
  type WorkOrder,
  type WorkOrderReport,
} from "../model/work-order"
import {
  WorkOrderPriorityBadge,
  WorkOrderSla,
  WorkOrderStatusBadge,
} from "./work-order-ui"

const CHANNEL_LABELS: Record<WorkOrderReport["channel"], string> = {
  qr: "QR bildirimi",
  portal: "Müşteri portalı",
  audit: "Denetim",
  panel: "Panel",
}

/**
 * İş emri detayı (panel ve müşteri portalı ortak). Portalda personel adı yerine "Saha ekibi"
 * ve iç aktörler yerine "Hizmet ekibi" gösterilir (sunucu maskeler).
 */
export function WorkOrderDetailView({
  order,
  extra,
}: {
  order: WorkOrder
  /** Panelde denetim bağlantısı gibi ek satırlar */
  extra?: { label: string; value: ReactNode }[]
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Özet</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <WorkOrderStatusBadge status={order.status} />
              <WorkOrderPriorityBadge priority={order.priority} />
              <WorkOrderSla order={order} />
            </div>
            <DetailList
              items={[
                {
                  label: "Lokasyon",
                  value: `${order.locationName} (${order.locationCode})`,
                },
                { label: "Alan", value: order.areaName ?? "—" },
                { label: "Müşteri", value: order.customerName },
                {
                  label: "Kaynak",
                  value: WORK_ORDER_SOURCE_LABELS[order.source],
                },
                { label: "Açılış", value: formatDateTime(order.createdAt) },
                {
                  label: "Son tarih (SLA)",
                  value: formatDateTime(order.dueAt),
                },
                { label: "Atanan", value: order.assigneeName ?? "Atanmadı" },
                {
                  label: "Tamamlanma",
                  value: order.completedAt
                    ? formatDateTime(order.completedAt)
                    : "—",
                },
                ...(extra ?? []),
              ]}
            />
            {order.description ? (
              <p className="text-sm whitespace-pre-line">{order.description}</p>
            ) : null}
            {order.cancelReason ? (
              <p className="text-sm">
                <span className="font-medium">İptal gerekçesi:</span>{" "}
                {order.cancelReason}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bildirimler ({order.reports.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {order.reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Bağlı bildirim yok.
              </p>
            ) : (
              <ol className="flex flex-col divide-y">
                {order.reports.map((report) => (
                  <li
                    key={report.id}
                    className="flex gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <QrCodeIcon
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                      <span className="font-medium">{report.issueLabel}</span>
                      <span className="text-xs text-muted-foreground">
                        {CHANNEL_LABELS[report.channel]} ·{" "}
                        {formatDateTime(report.receivedAt)}
                      </span>
                      {report.note ? <span>{report.note}</span> : null}
                      {report.photoUrl ? (
                        <img
                          src={report.photoUrl}
                          alt={`${report.issueLabel} bildirim fotoğrafı`}
                          className="mt-1 h-28 w-40 rounded-md border object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-6">
        {order.completionPhotoUrl || order.completionNote ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CameraIcon className="size-4" aria-hidden />
                Tamamlanma
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {order.completionPhotoUrl ? (
                <img
                  src={order.completionPhotoUrl}
                  alt="Tamamlanma fotoğrafı"
                  className="w-full rounded-md border object-cover"
                />
              ) : null}
              {order.completionNote ? (
                <p className="text-sm">{order.completionNote}</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Geçmiş</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3 text-sm">
              {[...order.history].reverse().map((event, index) => (
                <li
                  key={`${event.at}-${String(index)}`}
                  className="flex flex-col"
                >
                  <span className="font-medium">{event.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {event.actorName} · {formatDateTime(event.at)}
                  </span>
                  {event.note ? (
                    <span className="text-xs">{event.note}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
