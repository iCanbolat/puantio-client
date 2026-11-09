import { mockClock } from "../clock"
import { db } from "../db"
import { pick } from "../operations/hash"
import { ensureFeedbackArea } from "../scenarios/phase4"
import { mockUserId } from "../tenancy/users"
import { issuesFor } from "./feedback-handlers"
import {
  buildAudit,
  ensureQualityData,
  openAuditWorkOrders,
  versionAt,
} from "./seed"
import { receiveReport, workOrderEvent } from "./store"

/** Dev paneli: sabit WC alanından rastgele bir QR bildirimi (birleştirme kuralı uygulanır) */
export function simulateFeedback(tenantSlug: string): string | null {
  const tenant = db.tenants.findById(tenantSlug)
  if (tenant?.kind !== "tenant") return null
  ensureQualityData(tenant, mockClock.now())
  const target = ensureFeedbackArea(tenant.slug)
  if (!target) return null
  const location = db.locations.findById(target.locationId)
  const area = db.areas.findById(target.areaId) ?? null
  if (!location) return null
  const issues = issuesFor({ tenant, location, area })
  if (issues.length === 0) return null
  const issue = pick(String(mockClock.now().getTime()), issues)
  const { order, merged } = receiveReport(tenant, {
    ...target,
    categoryCode: issue.code,
    channel: "qr",
    note: null,
    photoId: null,
    receivedAt: mockClock.now().toISOString(),
    actorName: "QR bildirimi",
  })
  return `${order.number}${merged ? " (birleştirildi)" : ""} · ${issue.label}`
}

/**
 * Dev paneli: süpervizörün ilk planından saha uygulaması gibi bir denetim gönderir. İlk kritik
 * madde başarısız işaretlenir; iş emri açılır ve realtime ile panoya düşer.
 */
export function simulateAudit(tenantSlug: string): string | null {
  const tenant = db.tenants.findById(tenantSlug)
  if (tenant?.kind !== "tenant") return null
  ensureQualityData(tenant, mockClock.now())
  const plan = db.auditPlans.findFirst(
    (item) =>
      item.tenantId === tenant.slug &&
      item.auditorId === mockUserId(tenant.slug, "supervizor")
  )
  const template = plan ? db.auditTemplates.findById(plan.templateId) : null
  if (!plan || !template) return null
  const performedAt = mockClock.now().toISOString()
  const version = versionAt(template, performedAt)
  const firstCritical = version.sections
    .flatMap((section) => section.items)
    .find((item) => item.critical && item.type !== "note")
  const answers = version.sections.flatMap((section) =>
    section.items.map((item) => {
      const failed = item.id === firstCritical?.id
      return {
        itemId: item.id,
        passed:
          item.type === "yes_no" || item.type === "photo_required"
            ? !failed
            : null,
        score: item.type === "score_1_5" ? (failed ? 1 : 4) : null,
        note: failed ? "Saha simülasyonu: kritik bulgu" : null,
        photoCount: item.type === "photo_required" ? 1 : 0,
      }
    })
  )
  const audit = db.audits.insert(
    buildAudit(tenant, {
      id: `aud-sim-${crypto.randomUUID().slice(0, 8)}`,
      template,
      locationId: plan.locationId,
      auditorId: plan.auditorId,
      auditorName: db.users.findById(plan.auditorId)?.displayName ?? "Denetçi",
      performedAt,
      answers,
      generalNote: null,
    })
  )
  const orders = openAuditWorkOrders(tenant, audit)
  for (const order of orders) workOrderEvent("work_order.created", order)
  return `${audit.number} · puan ${String(audit.score)}${orders.length > 0 ? ` · ${String(orders.length)} iş emri` : ""}`
}
