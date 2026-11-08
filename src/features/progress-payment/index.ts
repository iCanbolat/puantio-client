import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

import { progressPaymentQueries } from "./api/progress-payment-api"
import { progressPaymentListParamsSchema } from "./model/progress-payment"

export * from "./model/progress-payment"
export {
  calculateProgressPayment,
  diffCalculations,
  sourceFingerprint,
  type CalculationInput,
  type CalculationVersion,
  type WorkedEntry,
} from "./domain/calculate"
export {
  progressPaymentKeys,
  progressPaymentQueries,
} from "./api/progress-payment-api"
export { CustomerProgressPayments } from "./components/customer-progress-payments"

const noop = () => undefined

/** Hakediş liste, detay ve baskı sayfaları (lazy chunk'lar) */
export function progressPaymentRoutes(
  queryClient: QueryClient
): Record<"list" | "detail" | "print", Pick<RouteObject, "lazy" | "loader">> {
  return {
    list: {
      loader: ({ request }) => {
        const params = parseSearchParams(
          progressPaymentListParamsSchema,
          new URL(request.url).searchParams
        )
        queryClient.query(progressPaymentQueries.list(params)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/payment-list-page")).PaymentListPage,
      }),
    },
    detail: {
      loader: ({ params }) => {
        if (params.paymentId)
          queryClient
            .query(progressPaymentQueries.detail(params.paymentId))
            .catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/payment-detail-page"))
          .PaymentDetailPage,
      }),
    },
    print: {
      lazy: async () => ({
        Component: (await import("./routes/payment-print-page"))
          .PaymentPrintPage,
      }),
    },
  }
}
