import { useQuery } from "@tanstack/react-query"
import { AlertTriangleIcon, CheckIcon, MinusIcon, XIcon } from "lucide-react"
import { Link, useParams } from "react-router"

import { useCan } from "@/entities/session"
import { DetailList } from "@/shared/components/detail-list"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { formatDateTime } from "@/shared/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"

import { qualityQueries } from "../api/quality-api"
import { AuditScoreBadge } from "../components/audit-ui"
import { formatScore } from "../lib/format"
import { isFailed, itemRatio, scoreAudit } from "../domain/scoring"
import {
  AUDIT_ITEM_TYPE_LABELS,
  type Audit,
  type AuditAnswer,
  type AuditItem,
} from "../model/audit"

function AnswerValue({
  item,
  answer,
}: {
  item: AuditItem
  answer: AuditAnswer | undefined
}) {
  if (item.type === "note")
    return <span className="text-sm">{answer?.note ?? "—"}</span>
  const ratio = itemRatio(item, answer)
  if (ratio === null)
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <MinusIcon className="size-4" aria-hidden />
        Uygulanamaz
      </span>
    )
  if (item.type === "score_1_5")
    return (
      <StatusBadge
        tone={ratio >= 0.5 ? (ratio === 1 ? "success" : "info") : "danger"}
      >
        {answer?.score} / 5
      </StatusBadge>
    )
  return ratio === 1 ? (
    <StatusBadge tone="success">
      <CheckIcon className="size-3.5" aria-hidden />
      Evet
    </StatusBadge>
  ) : (
    <StatusBadge tone="danger">
      <XIcon className="size-3.5" aria-hidden />
      Hayır
    </StatusBadge>
  )
}

export function AuditDetailPage() {
  const { auditId = "" } = useParams()
  const query = useQuery(qualityQueries.audit(auditId))
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  return <AuditDetail audit={query.data} />
}

function AuditDetail({ audit }: { audit: Audit }) {
  const canSeeWorkOrders = useCan("work_order:read")
  const answers = new Map(
    audit.answers.map((answer) => [answer.itemId, answer])
  )
  // Bölüm puanları gösterim içindir; resmi puan sunucunun kaydettiği puandır
  const sectionScores = new Map(
    scoreAudit(audit.sections, audit.answers, 0).sectionScores.map((entry) => [
      entry.sectionId,
      entry.score,
    ])
  )
  const workOrderByItem = new Map(
    audit.workOrders.map((order) => [order.itemId, order])
  )
  const photos = audit.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      (answers.get(item.id)?.photoUrls ?? []).map((url, index) => ({
        url,
        alt: `${item.text} fotoğrafı ${String(index + 1)}`,
      }))
    )
  )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Denetim ${audit.number}`}
        description={`${audit.locationName} · ${audit.templateName} (sürüm ${String(audit.templateVersion)})`}
        actions={
          <AuditScoreBadge
            score={audit.score}
            passed={audit.passed}
            criticalFailures={audit.criticalFailures}
          />
        }
      />
      <Card>
        <CardContent className="pt-6">
          <DetailList
            items={[
              {
                label: "Lokasyon",
                value: `${audit.locationName} (${audit.locationCode})`,
              },
              { label: "Bölge", value: audit.orgUnitName },
              { label: "Müşteri", value: audit.customerName },
              { label: "Denetçi", value: audit.auditorName },
              { label: "Tarih", value: formatDateTime(audit.performedAt) },
              { label: "Kritik bulgu", value: String(audit.criticalFailures) },
            ]}
          />
          {audit.generalNote ? (
            <p className="mt-4 text-sm">{audit.generalNote}</p>
          ) : null}
        </CardContent>
      </Card>
      {audit.sections.map((section) => {
        const sectionScore = sectionScores.get(section.id)
        return (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{section.title}</span>
                <span className="text-sm font-normal tabular-nums">
                  {sectionScore === null || sectionScore === undefined
                    ? "—"
                    : `${formatScore(sectionScore)} puan`}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col divide-y">
                {section.items.map((item) => {
                  const answer = answers.get(item.id)
                  const failedCritical = item.critical && isFailed(item, answer)
                  const order = workOrderByItem.get(item.id)
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {failedCritical ? (
                            <>
                              <AlertTriangleIcon
                                className="size-4 text-red-700 dark:text-red-400"
                                aria-hidden
                              />
                              <span className="sr-only">Kritik bulgu:</span>
                            </>
                          ) : null}
                          {item.text}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {AUDIT_ITEM_TYPE_LABELS[item.type]}
                          {item.type !== "note"
                            ? ` · ağırlık ${String(item.weight)}`
                            : ""}
                          {item.critical ? " · kritik" : ""}
                        </span>
                        {answer?.note && item.type !== "note" ? (
                          <span className="text-xs">{answer.note}</span>
                        ) : null}
                        {order && canSeeWorkOrders ? (
                          <Link
                            to={paths.workOrders.detail(order.id)}
                            className="text-xs font-medium underline"
                          >
                            İş emri {order.number}
                          </Link>
                        ) : null}
                      </div>
                      <AnswerValue item={item} answer={answer} />
                    </li>
                  )
                })}
              </ol>
            </CardContent>
          </Card>
        )
      })}
      <Card>
        <CardHeader>
          <CardTitle>Fotoğraflar ({photos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Fotoğraf yok.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo) => (
                <li key={photo.url}>
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <img
                      src={photo.url}
                      alt={photo.alt}
                      loading="lazy"
                      className="aspect-4/3 w-full rounded-md border object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Fotoğraf bağlantıları kısa süre geçerlidir ve tarayıcıda saklanmaz.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
