import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router"

import { WorkOrderDetailView, workOrderQueries } from "@/features/work-orders"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"

export function PortalWorkOrderDetailPage() {
  const { workOrderId = "" } = useParams()
  const query = useQuery(workOrderQueries.detail(workOrderId))
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={query.data.title}
        description={`${query.data.number} · ${query.data.locationName}`}
      />
      <WorkOrderDetailView order={query.data} />
    </div>
  )
}
