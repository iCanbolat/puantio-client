import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { contractListParamsSchema, contractQueries } from "@/entities/contract"
import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

import { contractDetailQueries } from "./api/contracts-api"

export * from "./model/contract"
export {
  checkAddendum,
  rangesOverlap,
  versionAt,
  versionLabel,
  versionSegments,
  type AddendumCheck,
  type VersionSegment,
} from "./domain/versions"
export {
  actualHeadcount,
  formatHeadcountGap,
  headcountGap,
  intersectRange,
  plannedDates,
  plannedDaysInMonth,
  workedFraction,
  type HeadcountGap,
} from "./domain/headcount"
export { diffVersions, type VersionDiffItem } from "./domain/version-diff"
export { totalHeadcount, validateCommitments } from "./domain/commitments"
export { contractDetailQueries, type HeadcountQuery } from "./api/contracts-api"
export { monthTitle, previousMonth, recentMonths } from "./lib/months"

const noop = () => undefined

/** Sözleşme, kadro raporu ve şablon sayfaları (lazy chunk'lar) */
export function contractRoutes(
  queryClient: QueryClient
): Record<
  "list" | "create" | "detail" | "headcount" | "headcountPrint" | "templates",
  Pick<RouteObject, "lazy" | "loader">
> {
  return {
    list: {
      loader: ({ request }) => {
        const params = parseSearchParams(
          contractListParamsSchema,
          new URL(request.url).searchParams
        )
        queryClient.query(contractQueries.list(params)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/contract-list-page"))
          .ContractListPage,
      }),
    },
    create: {
      lazy: async () => ({
        Component: (await import("./routes/contract-new-page")).ContractNewPage,
      }),
    },
    detail: {
      loader: ({ params }) => {
        if (params.contractId)
          queryClient
            .query(contractDetailQueries.detail(params.contractId))
            .catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/contract-detail-page"))
          .ContractDetailPage,
      }),
    },
    headcount: {
      lazy: async () => ({
        Component: (await import("./routes/headcount-page")).HeadcountPage,
      }),
    },
    headcountPrint: {
      lazy: async () => ({
        Component: (await import("./routes/headcount-print-page"))
          .HeadcountPrintPage,
      }),
    },
    templates: {
      lazy: async () => ({
        Component: (await import("./routes/templates-page"))
          .ContractTemplatesPage,
      }),
    },
  }
}
