import { HttpResponse, http } from "msw"

import { planCompliance, planSlots } from "@/features/quality-audit/domain/plan"
import {
  auditListParamsSchema,
  auditPlanInputSchema,
  auditPlanParamsSchema,
  auditTrendParamsSchema,
  submitAuditSchema,
  type Audit,
  type AuditPlanRow,
  type AuditSummary,
} from "@/features/quality-audit/model/audit"
import { includesTr } from "@/shared/lib/format"
import { toIsoDate } from "@/shared/lib/date"
import { addMonths, monthOf } from "@/shared/lib/work-time"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db } from "../db"
import type { MockAudit } from "../db/types"
import {
  apiPath,
  created,
  noContent,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import { paginate } from "../operations/common"
import {
  buildAudit,
  ensureQualityData,
  openAuditWorkOrders,
  versionAt,
} from "./seed"
import { signedFileUrl, workOrderEvent } from "./store"

const prepare = (auth: AuthContext) => {
  ensureQualityData(auth.tenant, mockClock.now())
}

export function visibleAudits(auth: AuthContext): MockAudit[] {
  const scope = createScope(auth)
  return db.audits.findMany(
    (item) =>
      item.tenantId === auth.tenant.slug && scope.locationId(item.locationId)
  )
}

export function serializeAuditSummary(item: MockAudit): AuditSummary {
  const location = db.locations.findById(item.locationId)
  const unit = location ? db.orgUnits.findById(location.orgUnitId) : null
  const customer = location ? db.customers.findById(location.customerId) : null
  const template = db.auditTemplates.findById(item.templateId)
  return {
    id: item.id as AuditSummary["id"],
    number: item.number,
    templateId: item.templateId,
    templateName: template?.name ?? "—",
    templateVersion: item.templateVersion,
    locationId: item.locationId,
    locationCode: location?.code ?? "—",
    locationName: location?.name ?? "—",
    orgUnitName: unit?.name ?? "—",
    customerName: customer?.name ?? "—",
    auditorName: item.auditorName,
    performedAt: item.performedAt,
    score: item.score,
    passed: item.passed,
    criticalFailures: item.criticalFailures.length,
    workOrderCount: db.workOrders.count((order) => order.auditId === item.id),
  }
}

function serializeAudit(item: MockAudit): Audit {
  const template = db.auditTemplates.findById(item.templateId)
  const version =
    template?.versions.find((entry) => entry.number === item.templateVersion) ??
    template?.versions[0]
  return {
    ...serializeAuditSummary(item),
    sections: version?.sections ?? [],
    answers: item.answers.map((answer) => ({
      itemId: answer.itemId,
      passed: answer.passed,
      score: answer.score,
      note: answer.note,
      photoUrls: Array.from({ length: answer.photoCount }, (_, index) =>
        signedFileUrl(
          "quality-photos",
          `${item.id}-${answer.itemId}-${String(index + 1)}`
        )
      ),
    })),
    generalNote: item.generalNote,
    workOrders: db.workOrders
      .findMany((order) => order.auditId === item.id)
      .map((order) => ({
        id: order.id,
        number: order.number,
        itemId: order.auditItemId ?? "",
        status: order.status,
      })),
  }
}

const photoSvg = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="#e2e8f0"/><rect x="40" y="40" width="240" height="140" rx="8" fill="#cbd5e1"/><circle cx="110" cy="95" r="22" fill="#94a3b8"/><path d="M60 170 L140 110 L200 150 L240 125 L280 170 Z" fill="#94a3b8"/><text x="160" y="215" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#334155">${label}</text></svg>`

function topUnitName(orgUnitId: string): { id: string; name: string } {
  let unit = db.orgUnits.findById(orgUnitId)
  while (unit?.parentId) {
    const parent = db.orgUnits.findById(unit.parentId)
    if (!parent || parent.level === 0) break
    unit = parent
  }
  return { id: unit?.id ?? orgUnitId, name: unit?.name ?? "—" }
}

const average = (values: number[]) =>
  values.length === 0
    ? null
    : Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 10
      ) / 10

export const auditHandlers = [
  http.get(
    apiPath("/audits"),
    withAuth("quality:read", ({ request, auth }) => {
      prepare(auth)
      const params = parseQuery(request, auditListParamsSchema)
      let items = visibleAudits(auth).filter((item) => {
        if (params.locationId && item.locationId !== params.locationId)
          return false
        if (params.templateId && item.templateId !== params.templateId)
          return false
        if (params.month && monthOf(item.performedAt) !== params.month)
          return false
        if (params.result === "passed" && !item.passed) return false
        if (params.result === "failed" && item.passed) return false
        if (params.result === "critical" && item.criticalFailures.length === 0)
          return false
        if (params.orgUnitId) {
          const location = db.locations.findById(item.locationId)
          if (
            !location ||
            topUnitName(location.orgUnitId).id !== params.orgUnitId
          )
            return false
        }
        return true
      })
      if (params.q) {
        const q = params.q
        items = items.filter((item) => {
          const location = db.locations.findById(item.locationId)
          return (
            includesTr(item.number, q) ||
            includesTr(location?.name ?? "", q) ||
            includesTr(location?.code ?? "", q) ||
            includesTr(item.auditorName, q)
          )
        })
      }
      const direction = params.order === "asc" ? 1 : -1
      items.sort((a, b) =>
        params.sort === "score"
          ? (a.score - b.score) * direction
          : a.performedAt.localeCompare(b.performedAt) * direction
      )
      const page = paginate(items, params.page, params.pageSize)
      return ok({
        items: page.items.map(serializeAuditSummary),
        meta: page.meta,
      })
    })
  ),
  http.get(
    apiPath("/audits/trend"),
    withAuth("quality:read", ({ request, auth }) => {
      prepare(auth)
      const params = parseQuery(request, auditTrendParamsSchema)
      const current = monthOf(mockClock.now())
      const months = Array.from({ length: params.months }, (_, index) =>
        addMonths(current, index - params.months + 1)
      )
      const audits = visibleAudits(auth).filter(
        (item) => !params.locationId || item.locationId === params.locationId
      )
      const point = (subset: MockAudit[], month: string) => {
        const inMonth = subset.filter(
          (item) => monthOf(item.performedAt) === month
        )
        return {
          month,
          average: average(inMonth.map((item) => item.score)),
          count: inMonth.length,
        }
      }
      const groups = new Map<string, { name: string; audits: MockAudit[] }>()
      for (const item of audits) {
        const location = db.locations.findById(item.locationId)
        if (!location) continue
        const key =
          params.groupBy === "location"
            ? { id: location.id, name: location.name }
            : topUnitName(location.orgUnitId)
        const group = groups.get(key.id) ?? { name: key.name, audits: [] }
        group.audits.push(item)
        groups.set(key.id, group)
      }
      return ok({
        overall: months.map((month) => point(audits, month)),
        groups: [...groups.entries()]
          .sort((a, b) => b[1].audits.length - a[1].audits.length)
          .slice(0, 6)
          .map(([id, group]) => ({
            id,
            name: group.name,
            points: months.map((month) => point(group.audits, month)),
          })),
      })
    })
  ),
  http.get(
    apiPath("/audits/:auditId"),
    withAuth("quality:read", ({ params, auth }) => {
      prepare(auth)
      const item = visibleAudits(auth).find(
        (entry) => entry.id === params.auditId
      )
      return item ? ok(serializeAudit(item)) : notFound()
    })
  ),
  /** Saha uygulamasının denetim gönderimi (web'de dev paneli simülasyonu kullanır) */
  http.post(
    apiPath("/audits"),
    withAuth("quality:write", async ({ request, auth }) => {
      prepare(auth)
      const parsed = await parseBody(request, submitAuditSchema)
      if (!parsed.success) return parsed.response
      const template = db.auditTemplates.findById(parsed.data.templateId)
      if (template?.tenantId !== auth.tenant.slug)
        return notFound("Şablon bulunamadı.")
      if (!createScope(auth).locationId(parsed.data.locationId))
        return notFound("Lokasyon bulunamadı.")
      const version = versionAt(template, parsed.data.performedAt)
      const itemIds = new Set(
        version.sections.flatMap((section) =>
          section.items.map((item) => item.id)
        )
      )
      if (parsed.data.answers.some((answer) => !itemIds.has(answer.itemId)))
        return problem(
          422,
          "UNKNOWN_ITEM",
          "Şablonda olmayan madde gönderildi."
        )
      const item = db.audits.insert(
        buildAudit(auth.tenant, {
          id: `aud-${crypto.randomUUID().slice(0, 12)}`,
          template,
          locationId: parsed.data.locationId,
          auditorId: auth.user?.id ?? null,
          auditorName: auth.actorName,
          performedAt: parsed.data.performedAt,
          answers: parsed.data.answers,
          generalNote: parsed.data.generalNote,
        })
      )
      const orders = openAuditWorkOrders(auth.tenant, item)
      // Realtime: panodaki diğer oturumlar da görür
      for (const order of orders) workOrderEvent("work_order.created", order)
      audit(auth, {
        action: "Denetim sonucu alındı",
        targetType: "audit",
        targetLabel: item.number,
        details:
          orders.length > 0 ? `${String(orders.length)} iş emri açıldı` : null,
      })
      return created(serializeAudit(item))
    })
  ),
  http.get(
    apiPath("/audit-plans"),
    withAuth("quality:read", ({ request, auth }) => {
      prepare(auth)
      const params = parseQuery(request, auditPlanParamsSchema)
      const now = mockClock.now()
      const month = params.ay ?? monthOf(now)
      const scope = createScope(auth)
      const audits = visibleAudits(auth)
      const items: AuditPlanRow[] = db.auditPlans
        .findMany(
          (plan) =>
            plan.tenantId === auth.tenant.slug &&
            plan.isActive &&
            scope.locationId(plan.locationId)
        )
        .map((plan) => {
          const location = db.locations.findById(plan.locationId)
          const template = db.auditTemplates.findById(plan.templateId)
          const auditor = db.users.findById(plan.auditorId)
          const done = audits.filter(
            (item) =>
              item.locationId === plan.locationId &&
              item.templateId === plan.templateId
          )
          const inMonth = done
            .filter((item) => monthOf(item.performedAt) === month)
            .map((item) => toIsoDate(item.performedAt))
          const compliance = planCompliance(
            planSlots(plan.frequency, plan.startDate, month),
            inMonth,
            now
          )
          return {
            id: plan.id,
            auditorId: plan.auditorId,
            locationId: plan.locationId,
            templateId: plan.templateId,
            frequency: plan.frequency,
            startDate: plan.startDate,
            auditorName: auditor?.displayName ?? "—",
            locationName: location?.name ?? "—",
            locationCode: location?.code ?? "—",
            templateName: template?.name ?? "—",
            ...compliance,
            lastAuditAt:
              done
                .map((item) => item.performedAt)
                .sort()
                .at(-1) ?? null,
          }
        })
        .sort((a, b) => a.locationName.localeCompare(b.locationName, "tr"))
      return ok({
        month,
        items,
        totals: {
          planned: items.reduce((sum, item) => sum + item.planned, 0),
          done: items.reduce((sum, item) => sum + item.done, 0),
          missing: items.reduce((sum, item) => sum + item.missing, 0),
        },
      })
    })
  ),
  http.get(
    apiPath("/audit-plans/auditors"),
    withAuth("quality:read", ({ auth }) => {
      const roleIds = new Set(
        db.roles
          .findMany(
            (role) =>
              role.tenantId === auth.tenant.slug &&
              role.permissions.includes("quality:write") &&
              !role.permissions.includes("portal:reports")
          )
          .map((role) => role.id)
      )
      const items = db.users
        .findMany(
          (user) =>
            user.tenantId === auth.tenant.slug &&
            user.status === "active" &&
            user.roleIds.some((id) => roleIds.has(id))
        )
        .map((user) => ({
          id: user.id,
          name: user.displayName,
          title: user.title ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
      return ok({ items })
    })
  ),
  http.post(
    apiPath("/audit-plans"),
    withAuth("quality:write", async ({ request, auth }) => {
      const parsed = await parseBody(request, auditPlanInputSchema)
      if (!parsed.success) return parsed.response
      const data = parsed.data
      if (!createScope(auth).locationId(data.locationId))
        return notFound("Lokasyon bulunamadı.")
      const template = db.auditTemplates.findById(data.templateId)
      if (template?.tenantId !== auth.tenant.slug)
        return notFound("Şablon bulunamadı.")
      const duplicate = db.auditPlans.findFirst(
        (plan) =>
          plan.tenantId === auth.tenant.slug &&
          plan.isActive &&
          plan.locationId === data.locationId &&
          plan.templateId === data.templateId
      )
      if (duplicate)
        return problem(
          409,
          "PLAN_EXISTS",
          "Bu lokasyon ve şablon için etkin bir plan zaten var."
        )
      const plan = db.auditPlans.insert({
        id: `apl-${crypto.randomUUID().slice(0, 10)}`,
        tenantId: auth.tenant.slug,
        ...data,
        isActive: true,
      })
      audit(auth, {
        action: "Denetim planı eklendi",
        targetType: "audit_plan",
        targetLabel:
          db.locations.findById(plan.locationId)?.name ?? plan.locationId,
      })
      return created({ id: plan.id })
    })
  ),
  http.delete(
    apiPath("/audit-plans/:planId"),
    withAuth("quality:write", ({ params, auth }) => {
      const plan = db.auditPlans.findById(String(params.planId))
      if (plan?.tenantId !== auth.tenant.slug) return notFound()
      if (!createScope(auth).locationId(plan.locationId)) return notFound()
      db.auditPlans.update(plan.id, { isActive: false })
      return noContent()
    })
  ),
  http.get(apiPath("/files/quality-photos/:id"), ({ request, params }) => {
    const url = new URL(request.url)
    const expires = Number(url.searchParams.get("exp"))
    if (
      !url.searchParams.get("sig") ||
      !expires ||
      expires < mockClock.now().getTime()
    ) {
      return problem(403, "URL_EXPIRED", "Fotoğraf bağlantısının süresi doldu.")
    }
    return new HttpResponse(
      photoSvg(`Fotoğraf · ${String(params.id).slice(-8)}`),
      {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "no-store, private",
        },
      }
    )
  }),
]
