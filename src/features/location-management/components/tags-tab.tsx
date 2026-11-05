import { useMutation, useQuery } from "@tanstack/react-query"
import { NfcIcon, RefreshCwIcon } from "lucide-react"
import { useState } from "react"

import {
  locationKeys,
  locationQueries,
  regenerateQrTag,
  type Area,
  type Location,
  type Tag,
} from "@/entities/location"
import { useCan } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import { ConfirmDialog } from "@/shared/components/confirm-dialog"
import { QrCode } from "@/shared/components/qr-code"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatDateTime } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import { NfcDialog, type NfcTarget } from "./nfc-dialog"
import { publicFeedbackUrl } from "./public-url"

interface TagTarget {
  targetType: "location" | "area"
  targetId: string
  label: string
  qr: string | null
  nfc: string | null
}

export function TagsTab({
  location,
  areas,
}: {
  location: Location
  areas: readonly Area[]
}) {
  const terms = useTerms()
  const canManage = useCan("location:tags")
  const tags = useQuery(locationQueries.tags(location.id))
  const [regenerating, setRegenerating] = useState<TagTarget | null>(null)
  const [nfcTarget, setNfcTarget] = useState<NfcTarget | null>(null)
  const regenerate = useMutation({
    mutationFn: (target: TagTarget) =>
      regenerateQrTag({
        targetType: target.targetType,
        targetId: target.targetId,
      }),
    meta: {
      successMessage: "Yeni QR etiketi üretildi; eskisi iptal edildi",
      invalidates: [locationKeys.detail(location.id)],
    },
  })

  const active = (targetId: string, kind: Tag["kind"]) =>
    tags.data?.find(
      (tag) =>
        tag.targetId === targetId &&
        tag.kind === kind &&
        tag.status === "active"
    )?.value ?? null

  const targets: TagTarget[] = [
    {
      targetType: "location",
      targetId: location.id,
      label: `${terms.location.singular} girişi`,
      qr: active(location.id, "qr"),
      nfc: active(location.id, "nfc"),
    },
    ...areas.map((area) => ({
      targetType: "area" as const,
      targetId: area.id,
      label: area.name,
      qr: active(area.id, "qr") ?? area.qrToken,
      nfc: active(area.id, "nfc") ?? area.nfcUid,
    })),
  ]
  const revoked = tags.data?.filter((tag) => tag.status === "revoked") ?? []

  return (
    <div className="flex flex-col gap-6">
      <ul
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Etiketler"
      >
        {targets.map((target) => (
          <li key={target.targetId}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">{target.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                {target.qr ? (
                  <QrCode
                    value={publicFeedbackUrl(target.qr)}
                    label={`${target.label} QR kodu`}
                    size={96}
                  />
                ) : (
                  <div className="flex size-24 items-center justify-center rounded-xl border text-xs text-muted-foreground">
                    QR yok
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">QR: </span>
                    <span
                      className="font-mono"
                      data-testid={`qr-${target.targetId}`}
                    >
                      {target.qr ?? "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">NFC: </span>
                    <span className="font-mono">{target.nfc ?? "—"}</span>
                  </p>
                  {canManage ? (
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRegenerating(target)
                        }}
                        aria-label={`${target.label} QR etiketini yeniden üret`}
                      >
                        <RefreshCwIcon data-icon="inline-start" />
                        Yeniden üret
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setNfcTarget({
                            targetType: target.targetType,
                            targetId: target.targetId,
                            label: target.label,
                            current: target.nfc,
                          })
                        }}
                        aria-label={`${target.label} için NFC etiketi ata`}
                      >
                        <NfcIcon data-icon="inline-start" />
                        NFC ata
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {revoked.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">İptal edilen etiketler</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption className="sr-only">
                İptal edilen etiketler
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Tür</TableHead>
                  <TableHead>Değer</TableHead>
                  <TableHead>Üretildi</TableHead>
                  <TableHead>İptal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revoked.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell>{tag.kind === "qr" ? "QR" : "NFC"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {tag.value}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDateTime(tag.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone="neutral">
                        {tag.revokedAt
                          ? formatDateTime(tag.revokedAt)
                          : "İptal"}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={regenerating !== null}
        onOpenChange={(open) => {
          if (!open) setRegenerating(null)
        }}
        title="QR etiketi yeniden üretilsin mi?"
        description={
          regenerating
            ? `${regenerating.label} için yeni QR kodu üretilir. Basılı eski etiket çalışmaz hale gelir; yenisini basıp değiştirin.`
            : undefined
        }
        confirmLabel="Yeniden üret"
        onConfirm={() =>
          regenerating ? regenerate.mutateAsync(regenerating) : undefined
        }
      />
      <NfcDialog
        locationId={location.id}
        target={nfcTarget}
        onClose={() => {
          setNfcTarget(null)
        }}
      />
    </div>
  )
}
