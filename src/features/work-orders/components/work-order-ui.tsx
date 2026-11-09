import { SlaCountdown } from "@/shared/components/sla-countdown"
import { StatusBadge } from "@/shared/components/status-badge"

import { isOpen } from "../domain/workflow"
import {
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_PRIORITY_TONES,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_TONES,
  type WorkOrderPriority,
  type WorkOrderStatus,
  type WorkOrderSummary,
} from "../model/work-order"

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return (
    <StatusBadge tone={WORK_ORDER_STATUS_TONES[status]}>
      {WORK_ORDER_STATUS_LABELS[status]}
    </StatusBadge>
  )
}

export function WorkOrderPriorityBadge({
  priority,
}: {
  priority: WorkOrderPriority
}) {
  return (
    <StatusBadge tone={WORK_ORDER_PRIORITY_TONES[priority]}>
      {WORK_ORDER_PRIORITY_LABELS[priority]}
    </StatusBadge>
  )
}

/** Açık iş emrinde geri sayım; kapananda süresinde mi kapandığı */
export function WorkOrderSla({
  order,
}: {
  order: Pick<
    WorkOrderSummary,
    "status" | "dueAt" | "completedAt" | "slaBreached"
  >
}) {
  if (isOpen(order.status))
    return <SlaCountdown dueAt={order.dueAt} warnBelowMs={30 * 60_000} />
  if (order.status === "cancelled")
    return <span className="text-xs text-muted-foreground">—</span>
  return order.slaBreached ? (
    <StatusBadge tone="danger">Gecikmeli kapandı</StatusBadge>
  ) : (
    <StatusBadge tone="success">Süresinde</StatusBadge>
  )
}
