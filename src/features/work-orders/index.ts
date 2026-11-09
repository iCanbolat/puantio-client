import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

import { workOrderQueries } from "./api/work-order-api"
import { workOrderListParamsSchema } from "./model/work-order"

export * from "./model/work-order"
export {
  actionForDrop,
  applyAction,
  availableActions,
  canApply,
  compareUrgency,
  dueAtFor,
  findMergeTarget,
  isBreached,
  isOpen,
  slaCompliance,
} from "./domain/workflow"
export {
  createWorkOrder,
  fetchAssignees,
  transitionWorkOrder,
  uploadPhoto,
  workOrderEvents,
  workOrderKeys,
  workOrderQueries,
} from "./api/work-order-api"
export { WorkOrderRealtimeBridge } from "./components/work-order-realtime-bridge"
export { WorkOrderDetailView } from "./components/work-order-detail"
export {
  WorkOrderPriorityBadge,
  WorkOrderSla,
  WorkOrderStatusBadge,
} from "./components/work-order-ui"

const noop = () => undefined

/** İş emri liste/pano, detay ve bildirim kataloğu sayfaları (lazy chunk'lar) */
export function workOrderRoutes(
  queryClient: QueryClient
): Record<"list" | "detail" | "catalog", Pick<RouteObject, "lazy" | "loader">> {
  return {
    list: {
      loader: ({ request }) => {
        const url = new URL(request.url)
        const params = parseSearchParams(
          workOrderListParamsSchema,
          url.searchParams
        )
        if (url.searchParams.get("gorunum") === "kanban")
          queryClient.query(workOrderQueries.board(params)).catch(noop)
        else queryClient.query(workOrderQueries.list(params)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/work-order-list-page"))
          .WorkOrderListPage,
      }),
    },
    detail: {
      loader: ({ params }) => {
        if (params.workOrderId)
          queryClient
            .query(workOrderQueries.detail(params.workOrderId))
            .catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/work-order-detail-page"))
          .WorkOrderDetailPage,
      }),
    },
    catalog: {
      lazy: async () => ({
        Component: (await import("./routes/issue-catalog-page"))
          .IssueCatalogPage,
      }),
    },
  }
}
