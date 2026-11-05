import { useQuery } from "@tanstack/react-query"
import {
  AlarmClockIcon,
  ClockAlertIcon,
  TimerIcon,
  UserCheckIcon,
  UserXIcon,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { ErrorState } from "@/shared/components/error-state"
import { StatCard } from "@/shared/components/stat-card"
import { formatPercent } from "@/shared/lib/format"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/chart"

import { attendanceQueries } from "../api/attendance-api"

const trendConfig = {
  rate: { label: "Katılım oranı", color: "var(--primary)" },
  absent: { label: "Devamsız", color: "var(--destructive)" },
} satisfies ChartConfig

const regionConfig = {
  rate: { label: "Katılım oranı", color: "var(--primary)" },
} satisfies ChartConfig

const shortDate = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}`

/** Modül 1 dashboard: katılım, geç kalma, devamsızlık trendi, bölge karşılaştırması, SLA */
export function AttendanceDashboard({
  orgUnitLabel,
}: {
  orgUnitLabel: string
}) {
  const query = useQuery(attendanceQueries.dashboard())
  if (query.isError) {
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  }
  const data = query.data
  const loading = query.isPending
  const trend = (data?.trend ?? []).map((day) => ({
    date: shortDate(day.date),
    rate: Math.round(day.attendanceRate * 1000) / 10,
    absent: day.absent,
  }))
  const regions = (data?.regions ?? []).map((region) => ({
    name: region.name,
    rate: Math.round(region.attendanceRate * 1000) / 10,
  }))
  return (
    <section
      aria-labelledby="attendance-dashboard-title"
      className="flex flex-col gap-4"
    >
      <h2
        id="attendance-dashboard-title"
        className="font-heading text-lg font-semibold"
      >
        Vardiya ve yoklama
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Bugünkü katılım"
          value={data ? formatPercent(data.today.attendanceRate) : "—"}
          hint={
            data
              ? `${data.today.present} / ${data.today.expected} vardiya`
              : undefined
          }
          icon={UserCheckIcon}
          tone={
            data && data.today.attendanceRate < 0.95 ? "warning" : "success"
          }
          isLoading={loading}
        />
        <StatCard
          label="Geç kalan (bugün)"
          value={data?.today.late ?? "—"}
          icon={ClockAlertIcon}
          tone={data && data.today.late > 0 ? "warning" : "default"}
          isLoading={loading}
        />
        <StatCard
          label="Devamsız (bugün)"
          value={data?.today.absent ?? "—"}
          icon={UserXIcon}
          tone={data && data.today.absent > 0 ? "danger" : "default"}
          isLoading={loading}
        />
        <StatCard
          label="SLA ihlali (14 gün)"
          value={data ? `${data.sla.breached} / ${data.sla.alarms}` : "—"}
          hint={data ? `Çözüm süresi > ${data.sla.slaMinutes} dk` : undefined}
          icon={AlarmClockIcon}
          tone={data && data.sla.breached > 0 ? "danger" : "default"}
          isLoading={loading}
        />
        <StatCard
          label="Ortalama müdahale"
          value={
            data
              ? `${data.sla.avgResponseMinutes.toLocaleString("tr-TR")} dk`
              : "—"
          }
          icon={TimerIcon}
          isLoading={loading}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Katılım trendi</CardTitle>
            <CardDescription>
              Son 14 gün, günlük katılım oranı (%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={trendConfig}
              className="h-56 w-full"
              role="img"
              aria-label="Katılım trendi grafiği"
            >
              <LineChart data={trend} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis
                  domain={[80, 100]}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  dataKey="rate"
                  type="monotone"
                  stroke="var(--color-rate)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{orgUnitLabel} karşılaştırması</CardTitle>
            <CardDescription>
              Katılım oranı en düşük birimler (%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={regionConfig}
              className="h-56 w-full"
              role="img"
              aria-label="Bölge karşılaştırma grafiği"
            >
              <BarChart
                data={regions}
                layout="vertical"
                margin={{ left: 8, right: 8 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis type="number" domain={[80, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="rate" fill="var(--color-rate)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
