import { mockClock } from "../clock"
import { db } from "../db"
import type { MockAudit, MockWorkOrder } from "../db/types"
import { ops } from "../operations/store"
import { buildAudit, openAuditWorkOrders } from "../quality/seed"
import { insertWorkOrder, receiveReport } from "../quality/store"
import { mockUserId } from "../tenancy/users"
import { scenarioLocationId } from "./phase2"
import { defineScenario } from "./types"

function tenants() {
  return db.tenants.findMany((tenant) => tenant.kind === "tenant")
}

/** Senaryolardaki sabit QR etiketi: süpervizörün ilk lokasyonunda "Zemin kat WC" */
export const feedbackDemoToken = (tenantId: string) =>
  `WC-${tenantId.toUpperCase()}`
export const feedbackDemoAreaId = (tenantId: string) =>
  `area-${tenantId}-demo-wc`

export function ensureFeedbackArea(tenantId: string) {
  const locationId = scenarioLocationId(tenantId)
  if (!locationId) return null
  const areaId = feedbackDemoAreaId(tenantId)
  if (!db.areas.findById(areaId)) {
    db.areas.insert({
      id: areaId,
      tenantId,
      locationId,
      name: "Zemin kat WC",
      type: "restroom",
      floor: "Zemin",
    })
    db.tags.insert({
      id: `tag-${tenantId}-demo-wc`,
      tenantId,
      targetType: "area",
      targetId: areaId,
      locationId,
      kind: "qr",
      value: feedbackDemoToken(tenantId),
      status: "active",
      createdAt: "2026-06-01T09:00:00+03:00",
      revokedAt: null,
    })
    // İptal edilmiş eski etiket (TC-4.3-02)
    db.tags.insert({
      id: `tag-${tenantId}-demo-wc-old`,
      tenantId,
      targetType: "area",
      targetId: areaId,
      locationId,
      kind: "qr",
      value: `${feedbackDemoToken(tenantId)}-ESKI`,
      status: "revoked",
      createdAt: "2026-01-10T09:00:00+03:00",
      revokedAt: "2026-06-01T09:00:00+03:00",
    })
  }
  // Lokasyonda temizlik hizmeti olmalı (sorun butonları hizmet hattına göre gelir)
  const location = db.locations.findById(locationId)
  if (location && !location.serviceLines.includes("cleaning"))
    db.locations.update(locationId, {
      serviceLines: ["cleaning", ...location.serviceLines],
    })
  return { locationId, areaId }
}

/** Aynı tuvaletten 10 dakika içinde gelen 5 "Kağıt havlu bitti" bildirimi */
export const FLOOD_REPORTS = 5

function setupFlood(): void {
  for (const tenant of tenants()) {
    const target = ensureFeedbackArea(tenant.slug)
    if (!target) continue
    const now = mockClock.now().getTime()
    for (let index = 0; index < FLOOD_REPORTS; index += 1) {
      receiveReport(tenant, {
        ...target,
        categoryCode: "paper_towel",
        channel: "qr",
        note: index === 0 ? "Sağdaki dispenser boş" : null,
        photoId: null,
        receivedAt: new Date(now - (10 - index * 2) * 60_000).toISOString(),
        actorName: "QR bildirimi",
      })
    }
  }
}

function setupAuditCriticalFail(): void {
  for (const tenant of tenants()) {
    const locationId = scenarioLocationId(tenant.slug)
    const template = db.auditTemplates.findById(
      `ats-${tenant.slug}-cleaning-office`
    )
    if (!locationId || !template) continue
    const version = template.versions.at(-1)!
    const answers = version.sections.flatMap((section) =>
      section.items.map((item) => ({
        itemId: item.id,
        // Sarf malzemesi maddesi (kritik) başarısız
        passed:
          item.type === "yes_no" || item.type === "photo_required"
            ? !item.text.startsWith("Sarf malzemesi")
            : null,
        score: item.type === "score_1_5" ? 4 : null,
        note: item.text.startsWith("Sarf malzemesi")
          ? "Havlu ve sabun yok"
          : null,
        photoCount: item.type === "photo_required" ? 1 : 0,
      }))
    )
    const audit = db.audits.insert(
      buildAudit(tenant, {
        id: `aud-${tenant.slug}-kritik`,
        template,
        locationId,
        auditorId: mockUserId(tenant.slug, "supervizor"),
        auditorName: "Hakan Çelik",
        performedAt: new Date(
          mockClock.now().getTime() - 30 * 60_000
        ).toISOString(),
        answers,
        generalNote: "Sarf malzemesi eksik, ekip bilgilendirildi.",
      })
    )
    openAuditWorkOrders(tenant, audit)
  }
}

function setupSlaBreach(): void {
  for (const tenant of tenants()) {
    const target = ensureFeedbackArea(tenant.slug)
    if (!target) continue
    const now = mockClock.now().getTime()
    const add = (
      title: string,
      priority: MockWorkOrder["priority"],
      hoursAgo: number
    ) =>
      insertWorkOrder(tenant, {
        title,
        description: null,
        source: "manual",
        priority,
        categoryCode: null,
        serviceLine: "cleaning",
        ...target,
        createdAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
        actorName: "Hakan Çelik",
      })
    // Acil 1 sa SLA → 2 sa önce açıldı (aşıldı); yüksek 4 sa → 5 sa önce (aşıldı); normal 24 sa
    add("SLA aşımı: Su kaçağı", "urgent", 2)
    add("SLA aşımı: Aydınlatma arızası", "high", 5)
    add("Zamanında: Cam silme", "normal", 1)
  }
}

/** TC-4.5-02 sabit veri seti: müşteri portalı Eylül 2026 raporu */
export const PORTAL_REPORT_MONTH = "2026-09"

export function portalReportCustomerId(tenantId: string): string | null {
  const user = db.users.findById(mockUserId(tenantId, "musteri"))
  return user?.scope.kind === "customers" ? (user.scope.ids[0] ?? null) : null
}

function setupPortalReport(): void {
  for (const tenant of tenants()) {
    const customerId = portalReportCustomerId(tenant.slug)
    const locations = db.locations.findMany(
      (location) =>
        location.tenantId === tenant.slug && location.customerId === customerId
    )
    const [first, second = first] = locations
    if (!first || !second) continue
    // Çalışma anı üretimini kapat; kiracının kalite verisi yalnızca bu fixture olsun
    ops.auditsGeneratedUntil.set(tenant.slug, "2099-12-31")
    ops.workOrdersSeeded.add(tenant.slug)
    for (const order of db.workOrders.findMany(
      (item) => item.tenantId === tenant.slug
    ))
      db.workOrders.remove(order.id)
    for (const audit of db.audits.findMany(
      (item) => item.tenantId === tenant.slug
    ))
      db.audits.remove(audit.id)

    const order = (
      key: string,
      fields: {
        source: MockWorkOrder["source"]
        priority: MockWorkOrder["priority"]
        createdAt: string
        completedAt?: string
        status: MockWorkOrder["status"]
      }
    ) => {
      const created = insertWorkOrder(tenant, {
        title: `Rapor fixture ${key}`,
        description: null,
        source: fields.source,
        priority: fields.priority,
        categoryCode: null,
        serviceLine: "cleaning",
        locationId: first.id,
        areaId: null,
        createdAt: fields.createdAt,
        actorName: "Sistem",
      })
      db.workOrders.update(created.id, {
        status: fields.status,
        completedAt: fields.completedAt ?? null,
      })
    }
    order("1", {
      source: "qr_feedback",
      priority: "high",
      createdAt: "2026-09-03T10:00:00+03:00",
      completedAt: "2026-09-03T12:00:00+03:00",
      status: "verified",
    })
    order("2", {
      source: "qr_feedback",
      priority: "urgent",
      createdAt: "2026-09-10T09:00:00+03:00",
      completedAt: "2026-09-10T11:00:00+03:00",
      status: "completed",
    })
    order("3", {
      source: "customer_request",
      priority: "normal",
      createdAt: "2026-09-15T08:00:00+03:00",
      completedAt: "2026-09-15T20:00:00+03:00",
      status: "verified",
    })
    order("4", {
      source: "audit_critical",
      priority: "high",
      createdAt: "2026-09-20T10:00:00+03:00",
      status: "in_progress",
    })
    order("5", {
      source: "manual",
      priority: "low",
      createdAt: "2026-09-28T10:00:00+03:00",
      completedAt: "2026-10-02T10:00:00+03:00",
      status: "verified",
    })
    order("6", {
      source: "qr_feedback",
      priority: "normal",
      createdAt: "2026-08-30T10:00:00+03:00",
      completedAt: "2026-09-01T09:00:00+03:00",
      status: "verified",
    })
    order("7", {
      source: "manual",
      priority: "normal",
      createdAt: "2026-09-05T10:00:00+03:00",
      status: "cancelled",
    })

    const template = db.auditTemplates.findFirst(
      (item) => item.tenantId === tenant.slug
    )
    if (!template) continue
    const audit = (
      key: string,
      locationId: string,
      performedAt: string,
      score: number,
      passed: boolean,
      critical: number
    ): MockAudit => ({
      id: `aud-${tenant.slug}-rapor-${key}`,
      tenantId: tenant.slug,
      number: `DN-RAPOR-${key}`,
      templateId: template.id,
      templateVersion: template.versions.at(-1)!.number,
      locationId,
      auditorId: null,
      auditorName: "Rapor fixture",
      performedAt,
      answers: [],
      generalNote: null,
      score,
      passed,
      criticalFailures: Array.from(
        { length: critical },
        (_, index) => `kritik-${String(index)}`
      ),
    })
    db.audits.insertMany([
      audit("1", first.id, "2026-09-04T10:00:00+03:00", 92.5, true, 0),
      audit("2", first.id, "2026-09-11T10:00:00+03:00", 78, false, 1),
      audit("3", second.id, "2026-09-18T10:00:00+03:00", 85, true, 0),
      audit("4", second.id, "2026-09-25T10:00:00+03:00", 70, false, 1),
      // Ay dışı: rapora girmez
      audit("5", first.id, "2026-10-01T10:00:00+03:00", 99, true, 0),
    ])
  }
}

export const phase4Scenarios = [
  defineScenario({
    id: "quality-demo",
    label: "Kalite: sabit QR etiketi",
    description:
      'Süpervizörün ilk lokasyonuna "Zemin kat WC" alanı ve WC-<KİRACI> QR etiketi eklenir (eski etiket iptal).',
    phase: 4,
    setup: () => {
      for (const tenant of tenants()) ensureFeedbackArea(tenant.slug)
    },
  }),
  defineScenario({
    id: "qr-report-flood",
    label: "QR bildirim seli",
    description:
      'Aynı tuvaletten 10 dakika içinde 5 "Kağıt havlu bitti" bildirimi; tek iş emrinde birleşir.',
    phase: 4,
    setup: setupFlood,
  }),
  defineScenario({
    id: "audit-critical-fail",
    label: "Kritik denetim bulgusu",
    description:
      "Yarım saat önce yapılan denetimde kritik sarf malzemesi maddesi başarısız; iş emri açılmış.",
    phase: 4,
    setup: setupAuditCriticalFail,
  }),
  defineScenario({
    id: "work-order-sla-breach",
    label: "İş emri SLA aşımı",
    description:
      "Biri acil, biri yüksek öncelikli iki iş emrinin SLA'sı aşılmış; biri zamanında.",
    phase: 4,
    setup: setupSlaBreach,
  }),
  defineScenario({
    id: "portal-month-report",
    label: "Portal aylık raporu (fixture)",
    description:
      "Müşteri kullanıcısının müşterisi için Eylül 2026'ya ait sabit iş emri ve denetim verisi.",
    phase: 4,
    setup: setupPortalReport,
  }),
]
