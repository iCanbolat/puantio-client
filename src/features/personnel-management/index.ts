import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import {
  personnelListParamsSchema,
  personnelQueries,
} from "@/entities/personnel"
import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

const noop = () => undefined

type LazyRoute = Pick<RouteObject, "lazy" | "loader">

export function personnelRoutes(
  queryClient: QueryClient
): Record<"list" | "create" | "detail" | "edit", LazyRoute> {
  const pages = () => import("./routes/personnel-pages")
  return {
    list: {
      loader: ({ request }) => {
        const params = parseSearchParams(
          personnelListParamsSchema,
          new URL(request.url).searchParams
        )
        queryClient.query(personnelQueries.list(params)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/personnel-list-page"))
          .PersonnelListPage,
      }),
    },
    create: {
      lazy: async () => ({ Component: (await pages()).PersonnelCreatePage }),
    },
    detail: {
      loader: ({ params }) => {
        if (params.personnelId)
          queryClient
            .query(personnelQueries.detail(params.personnelId))
            .catch(noop)
        return null
      },
      lazy: async () => ({ Component: (await pages()).PersonnelDetailPage }),
    },
    edit: {
      lazy: async () => ({ Component: (await pages()).PersonnelEditPage }),
    },
  }
}
