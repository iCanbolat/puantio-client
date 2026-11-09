import { useQuery } from "@tanstack/react-query"
import {
  BadgeCheckIcon,
  ClipboardListIcon,
  ClockAlertIcon,
  PlusIcon,
  TimerIcon,
  UsersIcon,
} from "lucide-react"
import { Link } from "react-router"

import {
  contractDetailQueries,
  monthTitle,
  previousMonth,
} from "@/features/contracts"
import { AuditScoreBadge } from "@/features/quality-audit"
import { WorkOrderSla, WorkOrderStatusBadge } from "@/features/work-orders"
import { Can, useCan } from "@/entities/session"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatCard } from "@/shared/components/stat-card"
import { paths } from "@/shared/config/paths"
import { formatDateTime, formatPercent } from "@/shared/lib/format"
import { serverNow } from "@/shared/lib/server-time"
import { buttonVariants } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"

import { portalQueries } from "../api/portal-api"

const formatScore = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("tr-TR", { minimumFractionDigits: 1 })

/** Portal özeti: SLA uyumu, denetim puanları, açık iş emirleri, kadro taahhüdü */
export function PortalHomePage() {
  const query = useQuery(portalQueries.summary())
  const canSeeHeadcount = useCan("contract:read")
  const month = previousMonth(serverNow())
  const headcount = useQuery({
    ...contractDetailQueries.headcount({ month }),
    enabled: canSeeHeadcount,
    meta: { silent: true },
  })
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  const summary = query.data
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={summary.customerName}
        description="Hizmet kalitesi özeti (son 30 gün)"
        actions={
          <Can permission="work_order:request">
            <Link to={paths.portal.request()} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              Talep aç
            </Link>
          </Can>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TimerIcon}
          label="SLA uyumu"
          value={
            summary.sla.rate === null ? "—" : formatPercent(summary.sla.rate)
          }
          hint={`${String(summary.sla.onTime)} / ${String(summary.sla.closed)} iş emri süresinde kapandı`}
        />
        <StatCard
          icon={ClipboardListIcon}
          label="Açık iş emri"
          value={summary.openWorkOrders}
          hint={
            <Link
              to={paths.portal.workOrders({ state: "open" })}
              className="underline"
            >
              Listeyi aç
            </Link>
          }
        />
        <StatCard
          icon={ClockAlertIcon}
          label="SLA'sı aşılan"
          value={summary.overdueWorkOrders}
          tone={summary.overdueWorkOrders > 0 ? "danger" : "default"}
        />
        <StatCard
          icon={BadgeCheckIcon}
          label="Ortalama denetim puanı"
          value={formatScore(summary.audits.average)}
          hint={`${String(summary.audits.count)} denetim, ${String(summary.audits.passed)} başarılı`}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Açık iş emirleri</CardTitle>
            <CardDescription>Son tarihi en yakın olanlar</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Açık iş emri yok.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {summary.recentOrders.map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <Link
                        to={paths.portal.workOrder(order.id)}
                        className="font-medium hover:underline"
                      >
                        {order.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {order.number} · {order.locationName}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <WorkOrderStatusBadge status={order.status} />
                      <WorkOrderSla order={order} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Son denetimler</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.recentAudits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Denetim yok.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {summary.recentAudits.map((audit) => (
                  <li
                    key={audit.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{audit.locationName}</span>
                      <span className="text-xs text-muted-foreground">
                        {audit.templateName} ·{" "}
                        {formatDateTime(audit.performedAt)}
                      </span>
                    </span>
                    <AuditScoreBadge
                      score={audit.score}
                      passed={audit.passed}
                      criticalFailures={audit.criticalFailures}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {canSeeHeadcount && headcount.data ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="size-4" aria-hidden />
              Kadro taahhüdü
            </CardTitle>
            <CardDescription className="capitalize">
              {monthTitle(month)}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Taahhüt" value={headcount.data.totals.committed} />
            <StatCard
              label="Fiili"
              value={headcount.data.totals.actual.toLocaleString("tr-TR")}
            />
            <StatCard
              label="Fark"
              value={(
                headcount.data.totals.actual - headcount.data.totals.committed
              ).toLocaleString("tr-TR", {
                maximumFractionDigits: 1,
                signDisplay: "exceptZero",
              })}
              tone={
                headcount.data.totals.actual < headcount.data.totals.committed
                  ? "danger"
                  : "default"
              }
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
