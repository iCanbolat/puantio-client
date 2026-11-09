import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useParams } from "react-router"

import { useCan } from "@/entities/session"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { paths } from "@/shared/config/paths"
import { Button } from "@/shared/ui/button"

import { workOrderQueries } from "../api/work-order-api"
import { TransitionDialog } from "../components/transition-dialog"
import { WorkOrderDetailView } from "../components/work-order-detail"
import { availableActions } from "../domain/workflow"
import {
  WORK_ORDER_ACTION_LABELS,
  type WorkOrderAction,
} from "../model/work-order"

export function WorkOrderDetailPage() {
  const { workOrderId = "" } = useParams()
  const query = useQuery(workOrderQueries.detail(workOrderId))
  const canWrite = useCan("work_order:write")
  const canReadQuality = useCan("quality:read")
  const [action, setAction] = useState<WorkOrderAction | null>(null)
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  const order = query.data
  const actions = canWrite ? availableActions(order.status) : []
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={order.title}
        description={`${order.number} · ${order.locationName}`}
        actions={
          actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((item, index) => (
                <Button
                  key={item}
                  variant={
                    item === "cancel" || item === "reopen"
                      ? "outline"
                      : index === 0
                        ? "default"
                        : "secondary"
                  }
                  onClick={() => {
                    setAction(item)
                  }}
                >
                  {WORK_ORDER_ACTION_LABELS[item]}
                </Button>
              ))}
            </div>
          ) : null
        }
      />
      <WorkOrderDetailView
        order={order}
        extra={
          order.auditId && canReadQuality
            ? [
                {
                  label: "Denetim",
                  value: (
                    <Link
                      to={paths.quality.audit(order.auditId)}
                      className="underline"
                    >
                      Denetim sonucunu aç
                    </Link>
                  ),
                },
              ]
            : []
        }
      />
      <TransitionDialog
        order={order}
        action={action}
        onClose={() => {
          setAction(null)
        }}
      />
    </div>
  )
}
