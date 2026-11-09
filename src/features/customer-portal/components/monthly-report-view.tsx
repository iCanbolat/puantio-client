import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_SOURCES,
  WORK_ORDER_SOURCE_LABELS,
} from "@/features/work-orders"
import { formatDuration, formatPercent } from "@/shared/lib/format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import type { MonthlyReport } from "../model/portal"

const score = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("tr-TR", { minimumFractionDigits: 1 })

function Figure({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl font-semibold tabular-nums">
        {value}
      </dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  )
}

/** Aylık SLA ve denetim raporu (portal sayfası ve A4 baskı düzeni ortak) */
export function MonthlyReportView({ report }: { report: MonthlyReport }) {
  const orders = report.workOrders
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="report-sla" className="flex flex-col gap-3">
        <h2 id="report-sla" className="font-heading text-lg font-semibold">
          SLA ve iş emirleri
        </h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure
            label="SLA uyumu"
            value={
              orders.slaRate === null ? "—" : formatPercent(orders.slaRate)
            }
            hint={`${String(orders.onTime)} / ${String(orders.closed)} süresinde`}
          />
          <Figure label="Açılan" value={orders.opened} />
          <Figure label="Kapanan" value={orders.closed} />
          <Figure label="Ay sonunda açık" value={orders.openAtMonthEnd} />
          <Figure
            label="Ortalama çözüm süresi"
            value={
              orders.averageResolutionMinutes === null
                ? "—"
                : formatDuration(orders.averageResolutionMinutes * 60_000)
            }
          />
        </dl>
        <div className="grid gap-4 md:grid-cols-2">
          <Table scrollLabel="Kaynağa göre iş emirleri">
            <TableHeader>
              <TableRow>
                <TableHead>Kaynak</TableHead>
                <TableHead className="text-right">Açılan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {WORK_ORDER_SOURCES.map((source) => (
                <TableRow key={source}>
                  <TableCell>{WORK_ORDER_SOURCE_LABELS[source]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {orders.bySource[source]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Table scrollLabel="Önceliğe göre iş emirleri">
            <TableHeader>
              <TableRow>
                <TableHead>Öncelik</TableHead>
                <TableHead className="text-right">Açılan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {WORK_ORDER_PRIORITIES.map((priority) => (
                <TableRow key={priority}>
                  <TableCell>{WORK_ORDER_PRIORITY_LABELS[priority]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {orders.byPriority[priority]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <section aria-labelledby="report-audits" className="flex flex-col gap-3">
        <h2 id="report-audits" className="font-heading text-lg font-semibold">
          Kalite denetimleri
        </h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure label="Denetim" value={report.audits.count} />
          <Figure label="Ortalama puan" value={score(report.audits.average)} />
          <Figure label="Başarılı" value={report.audits.passed} />
          <Figure label="Kritik bulgu" value={report.audits.criticalFailures} />
        </dl>
        {report.audits.byLocation.length > 0 ? (
          <Table scrollLabel="Lokasyon bazında denetim puanları">
            <TableHeader>
              <TableRow>
                <TableHead>Lokasyon</TableHead>
                <TableHead className="text-right">Denetim</TableHead>
                <TableHead className="text-right">Ortalama puan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.audits.byLocation.map((row) => (
                <TableRow key={row.locationId}>
                  <TableCell>{row.locationName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {score(row.average)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </section>
    </div>
  )
}
