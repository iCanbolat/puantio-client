import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

import { personnelFileQueries } from "./api/personnel-file-api"
import { personnelFileListParamsSchema } from "./model/personnel-file"

export * from "./model/personnel-file"
export { completionOf, documentState } from "./domain/completion"
export { personnelFileKeys } from "./api/personnel-file-api"
export { PersonnelFileTab } from "./components/personnel-file-tab"

const noop = () => undefined

export function personnelFileRoutes(
  queryClient: QueryClient
): Record<"list", Pick<RouteObject, "lazy" | "loader">> {
  return {
    list: {
      loader: ({ request }) => {
        const params = parseSearchParams(
          personnelFileListParamsSchema,
          new URL(request.url).searchParams
        )
        queryClient.query(personnelFileQueries.list(params)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/personnel-files-page"))
          .PersonnelFilesPage,
      }),
    },
  }
}
