import { http } from "msw"

import { validateTemplate } from "@/features/quality-audit/domain/scoring"
import {
  auditTemplateInputSchema,
  type AuditTemplate,
} from "@/features/quality-audit/model/audit"
import { issueCatalogSchema } from "@/features/work-orders/model/work-order"

import { audit, withAuth } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockAuditTemplate } from "../db/types"
import { created, notFound, ok, parseBody, problem } from "../http"
import { apiPath } from "../http"

export function serializeAuditTemplate(
  template: MockAuditTemplate
): AuditTemplate {
  const latest = template.versions.at(-1)!
  return {
    id: template.id as AuditTemplate["id"],
    name: template.name,
    description: template.description,
    serviceLine: template.serviceLine,
    sectors: template.sectors,
    sections: latest.sections,
    builtIn: template.builtIn,
    version: latest.number,
    versions: template.versions.map((version) => ({
      number: version.number,
      publishedAt: version.publishedAt,
      publishedBy: version.publishedBy,
      itemCount: version.sections.reduce(
        (sum, section) => sum + section.items.length,
        0
      ),
    })),
    isActive: template.isActive,
    updatedAt: template.updatedAt,
    auditCount: db.audits.count((item) => item.templateId === template.id),
  }
}

function templateProblems(sections: AuditTemplate["sections"]) {
  const issues = validateTemplate({ sections })
  if (issues.length === 0) return null
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of issues) {
    const key = issue.path === "_weights" ? "sections" : issue.path
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return problem(
    422,
    "VALIDATION_FAILED",
    issues.find((issue) => issue.path === "_weights")?.message ??
      "Şablonda hatalı maddeler var.",
    fieldErrors
  )
}

export const templateHandlers = [
  http.get(
    apiPath("/audit-templates"),
    withAuth("quality:read", ({ auth }) =>
      ok({
        items: db.auditTemplates
          .findMany((template) => template.tenantId === auth.tenant.slug)
          .sort(
            (a, b) =>
              Number(a.builtIn) - Number(b.builtIn) ||
              a.name.localeCompare(b.name, "tr")
          )
          .map(serializeAuditTemplate),
      })
    )
  ),
  http.get(
    apiPath("/audit-templates/:templateId"),
    withAuth("quality:read", ({ params, auth }) => {
      const template = db.auditTemplates.findById(String(params.templateId))
      if (template?.tenantId !== auth.tenant.slug) return notFound()
      return ok(serializeAuditTemplate(template))
    })
  ),
  http.post(
    apiPath("/audit-templates"),
    withAuth("quality:write", async ({ request, auth }) => {
      const parsed = await parseBody(request, auditTemplateInputSchema)
      if (!parsed.success) return parsed.response
      const invalid = templateProblems(parsed.data.sections)
      if (invalid) return invalid
      const now = mockClock.now().toISOString()
      const { sections, ...rest } = parsed.data
      const template = db.auditTemplates.insert({
        id: newId(`ats-${auth.tenant.slug}`),
        tenantId: auth.tenant.slug,
        ...rest,
        builtIn: false,
        versions: [
          {
            number: 1,
            publishedAt: now,
            publishedBy: auth.actorName,
            sections,
          },
        ],
        updatedAt: now,
      })
      audit(auth, {
        action: "Denetim şablonu oluşturuldu",
        targetType: "audit_template",
        targetLabel: template.name,
      })
      return created(serializeAuditTemplate(template))
    })
  ),
  http.put(
    apiPath("/audit-templates/:templateId"),
    withAuth("quality:write", async ({ request, params, auth }) => {
      const template = db.auditTemplates.findById(String(params.templateId))
      if (template?.tenantId !== auth.tenant.slug) return notFound()
      if (template.builtIn)
        return problem(
          409,
          "BUILT_IN",
          "Hazır şablon değiştirilemez; çoğaltıp düzenleyin."
        )
      const parsed = await parseBody(request, auditTemplateInputSchema)
      if (!parsed.success) return parsed.response
      const invalid = templateProblems(parsed.data.sections)
      if (invalid) return invalid
      const now = mockClock.now().toISOString()
      const { sections, ...rest } = parsed.data
      const latest = template.versions.at(-1)!
      const changed =
        JSON.stringify(latest.sections) !== JSON.stringify(sections)
      const updated = db.auditTemplates.update(template.id, {
        ...rest,
        versions: changed
          ? [
              ...template.versions,
              {
                number: latest.number + 1,
                publishedAt: now,
                publishedBy: auth.actorName,
                sections,
              },
            ]
          : template.versions,
        updatedAt: now,
      })!
      audit(auth, {
        action: changed
          ? `Denetim şablonu yeni sürüm (v${String(latest.number + 1)})`
          : "Denetim şablonu güncellendi",
        targetType: "audit_template",
        targetLabel: updated.name,
      })
      return ok(serializeAuditTemplate(updated))
    })
  ),
  http.get(
    apiPath("/issue-catalog"),
    withAuth("quality:read", ({ auth }) =>
      ok({ items: db.issueCatalogs.findById(auth.tenant.slug)?.items ?? [] })
    )
  ),
  http.put(
    apiPath("/issue-catalog"),
    withAuth("quality:write", async ({ request, auth }) => {
      const parsed = await parseBody(request, issueCatalogSchema)
      if (!parsed.success) return parsed.response
      const now = mockClock.now().toISOString()
      const existing = db.issueCatalogs.findById(auth.tenant.slug)
      if (existing)
        db.issueCatalogs.update(existing.id, {
          items: parsed.data.items,
          updatedAt: now,
        })
      else
        db.issueCatalogs.insert({
          id: auth.tenant.slug,
          tenantId: auth.tenant.slug,
          items: parsed.data.items,
          updatedAt: now,
        })
      audit(auth, {
        action: "Bildirim kataloğu güncellendi",
        targetType: "issue_catalog",
        targetLabel: `${String(parsed.data.items.length)} madde`,
      })
      return ok({ items: parsed.data.items })
    })
  ),
]
