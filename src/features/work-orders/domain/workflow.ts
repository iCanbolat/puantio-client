import type { QualityRules } from "@/entities/tenant"

import {
  OPEN_STATUSES,
  type WorkOrderAction,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from "../model/work-order"

/** Eylem → (izin verilen kaynak durumlar, hedef durum). Atama durumu ilerletmez, yalnız "Yeni"yi "Atandı" yapar. */
const TRANSITIONS: Record<
  WorkOrderAction,
  {
    from: readonly WorkOrderStatus[]
    to: (from: WorkOrderStatus) => WorkOrderStatus
  }
> = {
  assign: {
    from: ["new", "assigned", "in_progress"],
    to: (from) => (from === "new" ? "assigned" : from),
  },
  start: { from: ["assigned"], to: () => "in_progress" },
  complete: { from: ["in_progress"], to: () => "completed" },
  verify: { from: ["completed"], to: () => "verified" },
  reopen: { from: ["completed"], to: () => "in_progress" },
  cancel: { from: ["new", "assigned", "in_progress"], to: () => "cancelled" },
}

export function canApply(action: WorkOrderAction, status: WorkOrderStatus) {
  return TRANSITIONS[action].from.includes(status)
}

/** Eylem uygulanabiliyorsa yeni durum, değilse `null` */
export function applyAction(
  action: WorkOrderAction,
  status: WorkOrderStatus
): WorkOrderStatus | null {
  return canApply(action, status) ? TRANSITIONS[action].to(status) : null
}

export function availableActions(status: WorkOrderStatus): WorkOrderAction[] {
  return (Object.keys(TRANSITIONS) as WorkOrderAction[]).filter((action) =>
    canApply(action, status)
  )
}

/**
 * Kanban'da bir kartı başka sütuna bırakmak hangi eylemi tetikler? Geçersiz geçişte `null`
 * döner (ör. "Yeni"den doğrudan "Tamamlandı"ya).
 */
export function actionForDrop(
  from: WorkOrderStatus,
  to: WorkOrderStatus
): WorkOrderAction | null {
  if (from === to) return null
  const candidates: WorkOrderAction[] = [
    "assign",
    "start",
    "complete",
    "verify",
    "reopen",
  ]
  return (
    candidates.find(
      (action) => canApply(action, from) && TRANSITIONS[action].to(from) === to
    ) ?? null
  )
}

export function isOpen(status: WorkOrderStatus) {
  return OPEN_STATUSES.includes(status)
}

/** Önceliğin SLA süresine göre son tarih */
export function dueAtFor(
  createdAt: string,
  priority: WorkOrderPriority,
  rules: Pick<QualityRules, "slaMinutes">
): string {
  return new Date(
    Date.parse(createdAt) + rules.slaMinutes[priority] * 60_000
  ).toISOString()
}

export function isBreached(
  item: { status: WorkOrderStatus; dueAt: string; completedAt: string | null },
  now: number
) {
  if (isOpen(item.status)) return Date.parse(item.dueAt) < now
  if (item.status === "cancelled" || !item.completedAt) return false
  return Date.parse(item.completedAt) > Date.parse(item.dueAt)
}

const PRIORITY_RANK: Record<WorkOrderPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

/**
 * Aciliyet sıralaması: önce SLA'sı aşılmış açık iş emirleri (en çok geciken üstte), sonra
 * diğer açıklar (son tarihi yakın olan üstte, eşitlikte öncelik), en sonda kapananlar
 * (yeniden eskiye).
 */
export function compareUrgency(now: number) {
  return (
    a: {
      status: WorkOrderStatus
      dueAt: string
      priority: WorkOrderPriority
      createdAt: string
    },
    b: {
      status: WorkOrderStatus
      dueAt: string
      priority: WorkOrderPriority
      createdAt: string
    }
  ) => {
    const group = (item: typeof a) =>
      isOpen(item.status) ? (Date.parse(item.dueAt) < now ? 0 : 1) : 2
    const diff = group(a) - group(b)
    if (diff !== 0) return diff
    if (group(a) === 2) return Date.parse(b.createdAt) - Date.parse(a.createdAt)
    const due = Date.parse(a.dueAt) - Date.parse(b.dueAt)
    if (due !== 0) return due
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  }
}

/**
 * Aynı alandan kısa sürede gelen bildirimleri birleştirme: aynı alan (alan yoksa lokasyon)
 * ve aynı sorun koduna sahip, hâlâ açık ve son bildirimi pencere içinde olan iş emri.
 */
export function findMergeTarget<
  T extends {
    status: WorkOrderStatus
    locationId: string
    areaId: string | null
    categoryCode: string | null
    lastReportAt: string
  },
>(
  candidates: readonly T[],
  incoming: {
    locationId: string
    areaId: string | null
    categoryCode: string
    receivedAt: string
  },
  windowMinutes: number
): T | null {
  if (windowMinutes <= 0) return null
  const at = Date.parse(incoming.receivedAt)
  const matches = candidates.filter(
    (item) =>
      isOpen(item.status) &&
      item.locationId === incoming.locationId &&
      item.areaId === incoming.areaId &&
      item.categoryCode === incoming.categoryCode &&
      at - Date.parse(item.lastReportAt) <= windowMinutes * 60_000 &&
      at >= Date.parse(item.lastReportAt) - 60_000
  )
  matches.sort(
    (a, b) => Date.parse(b.lastReportAt) - Date.parse(a.lastReportAt)
  )
  return matches[0] ?? null
}

/** SLA uyumu: kapanan (tamamlanan/doğrulanan) iş emirlerinden süresinde kapananların oranı */
export function slaCompliance(
  items: readonly {
    status: WorkOrderStatus
    dueAt: string
    completedAt: string | null
  }[]
): { closed: number; onTime: number; rate: number | null } {
  let closed = 0
  let onTime = 0
  for (const item of items) {
    if (item.status !== "completed" && item.status !== "verified") continue
    if (item.completedAt === null) continue
    closed += 1
    if (Date.parse(item.completedAt) <= Date.parse(item.dueAt)) onTime += 1
  }
  return { closed, onTime, rate: closed === 0 ? null : onTime / closed }
}
