import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

import { ohsQueries } from "./api/ohs-api"
import {
  certificateListParamsSchema,
  trainingStatusParamsSchema,
} from "./model/ohs"

export * from "./model/ohs"
export { buildAuditPackRows, isCompliant } from "./domain/audit-pack"
export { ohsKeys, ohsQueries } from "./api/ohs-api"
export { PersonnelOhsTab } from "./components/personnel-ohs-tab"

const noop = () => undefined

/** İSG sayfaları (lazy chunk'lar) */
export function ohsRoutes(
  queryClient: QueryClient
): Record<
  | "overview"
  | "trainings"
  | "certificates"
  | "auditPack"
  | "portalAuditPack"
  | "auditPackPrint"
  | "settings",
  Pick<RouteObject, "lazy" | "loader">
> {
  return {
    overview: {
      loader: () => {
        queryClient.query(ohsQueries.overview()).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/overview-page")).OhsOverviewPage,
      }),
    },
    trainings: {
      loader: ({ request }) => {
        const { sekme: _tab, ...params } = parseSearchParams(
          trainingStatusParamsSchema,
          new URL(request.url).searchParams
        )
        queryClient.query(ohsQueries.settings()).catch(noop)
        queryClient.query(ohsQueries.trainingStatus(params)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/trainings-page")).TrainingsPage,
      }),
    },
    certificates: {
      loader: ({ request }) => {
        const params = parseSearchParams(
          certificateListParamsSchema,
          new URL(request.url).searchParams
        )
        queryClient
          .query(
            ohsQueries.certificates({
              ...params,
              sort: params.sort ?? "expiresAt",
              order: params.order ?? "asc",
            })
          )
          .catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/certificates-page"))
          .CertificatesPage,
      }),
    },
    auditPack: {
      lazy: async () => ({
        Component: (await import("./routes/audit-pack-page")).AuditPackPage,
      }),
    },
    portalAuditPack: {
      loader: () => {
        queryClient.query(ohsQueries.portalLocations()).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/audit-pack-page"))
          .PortalAuditPackPage,
      }),
    },
    auditPackPrint: {
      lazy: async () => ({
        Component: (await import("./routes/audit-pack-print-page"))
          .AuditPackPrintPage,
      }),
    },
    settings: {
      loader: () => {
        queryClient.query(ohsQueries.settings()).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/settings-page")).OhsSettingsPage,
      }),
    },
  }
}
