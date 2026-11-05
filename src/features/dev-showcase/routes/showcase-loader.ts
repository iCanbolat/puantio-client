import type { QueryClient } from "@tanstack/react-query"
import type { LoaderFunctionArgs } from "react-router"

import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

import { showcaseQueries } from "../api/showcase-api"
import { showcaseListParamsSchema } from "../model/showcase-record"

const noop = () => undefined

/**
 * Loader veriyi önceden çekmeye başlar (lazy chunk ile paralel). Hatalar yutulur; hata
 * durumu sayfadaki tablo içinde "Tekrar dene" ile gösterilir.
 */
export function createShowcaseLoader(queryClient: QueryClient) {
  return ({ request }: LoaderFunctionArgs) => {
    const params = parseSearchParams(
      showcaseListParamsSchema,
      new URL(request.url).searchParams
    )
    queryClient.query(showcaseQueries.list(params)).catch(noop)
    return null
  }
}
