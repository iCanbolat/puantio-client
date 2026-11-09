import { toIsoDate } from "@/shared/lib/date"

import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SOURCES,
  type WorkOrderPriority,
  type WorkOrderSource,
  type WorkOrderStatus,
} from "@/features/work-orders"

/** Ay, İstanbul saatine göre ("2026-09-30T23:30+03:00" Eylül'dür) */
const monthOfInstant = (iso: string) => toIsoDate(iso).slice(0, 7)

const average1 = (values: readonly number[]) =>
  values.length === 0
    ? null
    : Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 10
      ) / 10

export interface ReportWorkOrder {
  source: WorkOrderSource
  priority: WorkOrderPriority
  status: WorkOrderStatus
  createdAt: string
  dueAt: string
  completedAt: string | null
}

export interface ReportAudit {
  locationId: string
  locationName: string
  score: number
  passed: boolean
  criticalFailures: number
  performedAt: string
}

const zeroCounts = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>

/**
 * Aylık SLA ve denetim raporu agregasyonu (portal raporu, baskı düzeni ve dışa aktarma aynı
 * sonucu kullanır):
 * - açılan: ay içinde oluşturulan; kapanan: ay içinde tamamlanan (doğrulananlar dahil),
 * - süresinde: kapananlardan tamamlanma ≤ son tarih; SLA oranı = süresinde ÷ kapanan,
 * - ay sonunda açık: ay sonuna kadar açılmış, ay sonunda henüz tamamlanmamış (iptaller hariç).
 */
export function buildMonthlyReport(input: {
  month: string
  workOrders: readonly ReportWorkOrder[]
  audits: readonly ReportAudit[]
}) {
  const { month } = input
  const opened = input.workOrders.filter(
    (item) => monthOfInstant(item.createdAt) === month
  )
  const closed: (ReportWorkOrder & { completedAt: string })[] = []
  for (const item of input.workOrders) {
    if (item.status !== "completed" && item.status !== "verified") continue
    if (item.completedAt === null || monthOfInstant(item.completedAt) !== month)
      continue
    closed.push({ ...item, completedAt: item.completedAt })
  }
  const onTime = closed.filter(
    (item) => Date.parse(item.completedAt) <= Date.parse(item.dueAt)
  ).length
  const openAtMonthEnd = input.workOrders.filter(
    (item) =>
      item.status !== "cancelled" &&
      monthOfInstant(item.createdAt) <= month &&
      (item.completedAt === null || monthOfInstant(item.completedAt) > month)
  ).length
  const bySource = zeroCounts(WORK_ORDER_SOURCES)
  const byPriority = zeroCounts(WORK_ORDER_PRIORITIES)
  for (const item of opened) {
    bySource[item.source] += 1
    byPriority[item.priority] += 1
  }

  const audits = input.audits.filter(
    (item) => monthOfInstant(item.performedAt) === month
  )
  const locations = new Map<string, { name: string; scores: number[] }>()
  for (const item of audits) {
    const entry = locations.get(item.locationId) ?? {
      name: item.locationName,
      scores: [],
    }
    entry.scores.push(item.score)
    locations.set(item.locationId, entry)
  }
  return {
    workOrders: {
      opened: opened.length,
      closed: closed.length,
      onTime,
      slaRate: closed.length === 0 ? null : onTime / closed.length,
      averageResolutionMinutes:
        closed.length === 0
          ? null
          : Math.round(
              closed.reduce(
                (sum, item) =>
                  sum +
                  (Date.parse(item.completedAt) - Date.parse(item.createdAt)),
                0
              ) /
                closed.length /
                60_000
            ),
      openAtMonthEnd,
      bySource,
      byPriority,
    },
    audits: {
      count: audits.length,
      average: average1(audits.map((item) => item.score)),
      passed: audits.filter((item) => item.passed).length,
      criticalFailures: audits.reduce(
        (sum, item) => sum + item.criticalFailures,
        0
      ),
      byLocation: [...locations.entries()]
        .map(([locationId, entry]) => ({
          locationId,
          locationName: entry.name,
          count: entry.scores.length,
          average: average1(entry.scores),
        }))
        .sort((a, b) => a.locationName.localeCompare(b.locationName, "tr")),
    },
  }
}
