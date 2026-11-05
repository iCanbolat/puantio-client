import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { locationListParamsSchema, locationQueries } from "@/entities/location"
import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

const noop = () => undefined

type LazyRoute = Pick<RouteObject, "lazy" | "loader">

/** Lokasyon listesi/haritası, formu, kartı ve etiket baskısı (lazy chunk'lar). */
export function locationRoutes(
  queryClient: QueryClient
): Record<"list" | "create" | "detail" | "edit" | "print", LazyRoute> {
  return {
    list: {
      loader: ({ request }) => {
        const { gorunum, ...params } = parseSearchParams(
          locationListParamsSchema,
          new URL(request.url).searchParams
        )
        if (gorunum === "liste")
          queryClient.query(locationQueries.list(params)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/location-list-page"))
          .LocationListPage,
      }),
    },
    create: {
      lazy: async () => ({
        Component: (await import("./routes/location-form-page"))
          .LocationCreatePage,
      }),
    },
    detail: {
      loader: ({ params }) => {
        if (params.locationId) {
          queryClient
            .query(locationQueries.detail(params.locationId))
            .catch(noop)
          queryClient
            .query(locationQueries.areas(params.locationId))
            .catch(noop)
        }
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/location-detail-page"))
          .LocationDetailPage,
      }),
    },
    edit: {
      lazy: async () => ({
        Component: (await import("./routes/location-form-page"))
          .LocationEditPage,
      }),
    },
    print: {
      lazy: async () => ({
        Component: (await import("./routes/tag-print-page")).TagPrintPage,
      }),
    },
  }
}
