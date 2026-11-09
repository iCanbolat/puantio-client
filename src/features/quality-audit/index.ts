import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import { parseSearchParams } from "@/shared/hooks/use-search-params-state"

import { qualityQueries } from "./api/quality-api"
import { auditListParamsSchema, auditPlanParamsSchema } from "./model/audit"

export * from "./model/audit"
export {
  isFailed,
  itemRatio,
  scoreAudit,
  totalWeight,
  validateTemplate,
  workOrdersFromAudit,
} from "./domain/scoring"
export { planCompliance, planSlots } from "./domain/plan"
export { qualityKeys, qualityQueries, submitAudit } from "./api/quality-api"
export { AuditScoreBadge } from "./components/audit-ui"

const noop = () => undefined

/** Kalite denetim sayfaları (lazy chunk'lar) */
export function qualityRoutes(
  queryClient: QueryClient
): Record<
  "audits" | "audit" | "templates" | "template" | "plan",
  Pick<RouteObject, "lazy" | "loader">
> {
  return {
    audits: {
      loader: ({ request }) => {
        const params = parseSearchParams(
          auditListParamsSchema,
          new URL(request.url).searchParams
        )
        queryClient
          .query(
            qualityQueries.audits({
              ...params,
              sort: params.sort ?? "performedAt",
              order: params.order ?? "desc",
            })
          )
          .catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/audit-list-page")).AuditListPage,
      }),
    },
    audit: {
      loader: ({ params }) => {
        if (params.auditId)
          queryClient.query(qualityQueries.audit(params.auditId)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/audit-detail-page")).AuditDetailPage,
      }),
    },
    templates: {
      loader: () => {
        queryClient.query(qualityQueries.templates()).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/template-list-page"))
          .TemplateListPage,
      }),
    },
    template: {
      loader: ({ params }) => {
        if (params.templateId)
          queryClient
            .query(qualityQueries.template(params.templateId))
            .catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/template-editor-page"))
          .TemplateEditorPage,
      }),
    },
    plan: {
      loader: ({ request }) => {
        const params = parseSearchParams(
          auditPlanParamsSchema,
          new URL(request.url).searchParams
        )
        queryClient.query(qualityQueries.plan(params.ay)).catch(noop)
        return null
      },
      lazy: async () => ({
        Component: (await import("./routes/audit-plan-page")).AuditPlanPage,
      }),
    },
  }
}
