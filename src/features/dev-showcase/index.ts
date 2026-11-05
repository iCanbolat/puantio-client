import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

/**
 * Dev-showcase feature'ının public API'si. Route modülü lazy yüklenir; sayfa kodu
 * ana paketten ayrı bir chunk'tır.
 */
export function devShowcaseRoute(
  queryClient: QueryClient
): Pick<RouteObject, "lazy"> {
  return {
    lazy: async () => {
      const [page, loader] = await Promise.all([
        import("./routes/showcase-page"),
        import("./routes/showcase-loader"),
      ])
      return {
        Component: page.ShowcasePage,
        loader: loader.createShowcaseLoader(queryClient),
      }
    },
  }
}
