import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import type { AuditTrend } from "../model/audit"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
]

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("tr-TR", { month: "short", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`)
  )

/**
 * Lokasyon/bölge aylık puan trendi. Recharts ağır olduğu için ayrı chunk'ta tembel yüklenir.
 * Grafiğin altında aynı veri tablo olarak da verilir (ekran okuyucular için).
 */
export default function ScoreTrendChart({ trend }: { trend: AuditTrend }) {
  const config: ChartConfig = {
    overall: { label: "Genel ortalama", color: "var(--foreground)" },
    ...Object.fromEntries(
      trend.groups.map((group, index) => [
        `g${String(index)}`,
        { label: group.name, color: COLORS[index % COLORS.length] },
      ])
    ),
  }
  const data = trend.overall.map((point, index) => ({
    month: monthLabel(point.month),
    overall: point.average,
    ...Object.fromEntries(
      trend.groups.map((group, groupIndex) => [
        `g${String(groupIndex)}`,
        group.points[index]?.average ?? null,
      ])
    ),
  }))
  return (
    <div className="flex flex-col gap-4">
      <ChartContainer
        config={config}
        className="h-64 w-full"
        role="img"
        aria-label="Aylık ortalama denetim puanı grafiği"
      >
        <LineChart data={data} margin={{ left: 0, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <YAxis
            domain={[50, 100]}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            dataKey="overall"
            type="monotone"
            stroke="var(--color-overall)"
            strokeWidth={3}
            dot={false}
            connectNulls
          />
          {trend.groups.map((group, index) => (
            <Line
              key={group.id}
              dataKey={`g${String(index)}`}
              type="monotone"
              stroke={`var(--color-g${String(index)})`}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>
      <Table scrollLabel="Aylık ortalama puan tablosu">
        <TableHeader>
          <TableRow>
            <TableHead>Grup</TableHead>
            {trend.overall.map((point) => (
              <TableHead key={point.month} className="text-right capitalize">
                {monthLabel(point.month)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            { id: "overall", name: "Genel", points: trend.overall },
            ...trend.groups,
          ].map((group) => (
            <TableRow key={group.id}>
              <TableCell className="font-medium">{group.name}</TableCell>
              {group.points.map((point) => (
                <TableCell
                  key={point.month}
                  className="text-right tabular-nums"
                >
                  {point.average === null
                    ? "—"
                    : point.average.toLocaleString("tr-TR", {
                        minimumFractionDigits: 1,
                      })}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
