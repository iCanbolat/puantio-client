import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { customerListParamsSchema, customerQueries } from "@/entities/customer"
import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

const noop = () => undefined

/** Müşteri listesi ve kartı (lazy chunk'lar; loader listeyi önceden çeker). */
export function customerRoutes(
  queryClient: QueryClient
): Record<"list" | "detail", Pick<RouteObject, "lazy" | "loader">> {
  return {
    list: {
      loader: ({ request }) => {
        const params = parseSearchParams(
          customerListParamsSchema,
          new URL(request.url).searchParams
        )
        queryClient.query(customerQueries.list(params)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/customer-list-page"))
          .CustomerListPage,
      }),
    },
    detail: {
      loader: ({ params }) => {
        if (params.customerId)
          queryClient
            .query(customerQueries.detail(params.customerId))
            .catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/customer-detail-page"))
          .CustomerDetailPage,
      }),
    },
  }
}
