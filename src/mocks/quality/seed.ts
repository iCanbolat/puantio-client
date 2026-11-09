import {
  scoreAudit,
  workOrdersFromAudit,
} from "@/features/quality-audit/domain/scoring"
import { planSlots } from "@/features/quality-audit/domain/plan"
import { toIsoDate } from "@/shared/lib/date"
import { addDaysIso, istanbulDateTime, monthOf } from "@/shared/lib/work-time"

import { SEED_REFERENCE_DATE } from "../factories/faker"
import { db } from "../db"
import type {
  MockAudit,
  MockAuditAnswer,
  MockAuditPlan,
  MockAuditTemplate,
  MockLocation,
} from "../db/types"
import type { TenantMasterData } from "../master-data/factories"
import { pick, rand, randInt } from "../operations/hash"
import { ops } from "../operations/store"
import type { MockTenant } from "../tenancy/tenants"
import { mockUserId } from "../tenancy/users"
import { DEFAULT_ISSUE_CATALOG } from "./catalog"
import { insertWorkOrder, qualityRules } from "./store"
import { buildAuditTemplates } from "./templates"

/** Seed denetimlerinin başladığı gün (planların başlangıcı) */
export const AUDIT_HISTORY_START = "2026-06-01"

/** Lokasyona uygun şablon: önce hizmet hattı + müşteri sektörü, sonra yalnızca hizmet hattı */
export function templateForLocation(
  templates: readonly MockAuditTemplate[],
  location: MockLocation
): MockAuditTemplate | null {
  const sector = db.customers.findById(location.customerId)?.sector
  const usable = templates.filter(
    (template) =>
      template.isActive && location.serviceLines.includes(template.serviceLine)
  )
  return (
    usable.find((template) => sector && template.sectors.includes(sector)) ??
    usable.find((template) => template.sectors.length === 0) ??
    usable[0] ??
    null
  )
}

/**
 * Kalite modülünün statik verisi: sorun kataloğu, şablon kütüphanesi, denetim planları ve
 * rapor abonelikleri. Faker kullanılmaz (sonraki kiracıların verisi değişmesin); denetim
 * sonuçları ve örnek iş emirleri `ensureQualityData` ile ilk istekte üretilir.
 */
export function seedQuality(tenant: MockTenant, data: TenantMasterData): void {
  const updatedAt = SEED_REFERENCE_DATE.toISOString()
  db.issueCatalogs.insert({
    id: tenant.slug,
    tenantId: tenant.slug,
    items: structuredClone(DEFAULT_ISSUE_CATALOG),
    updatedAt,
  })
  const templates = buildAuditTemplates(
    tenant.slug,
    tenant.serviceLines,
    "2026-05-15T10:00:00+03:00"
  )
  db.auditTemplates.insertMany(templates)

  const supervisor = db.users.findById(mockUserId(tenant.slug, "supervizor"))
  const supervised =
    supervisor?.scope.kind === "locations" ? supervisor.scope.ids : []
  const firstCustomer = data.customers[0]?.id
  // Yalnızca uygun şablonu olan aktif lokasyonlar planlanır
  const active = data.locations.filter(
    (location) =>
      location.status === "active" &&
      templateForLocation(templates, location) !== null
  )
  const chosen = [
    ...active.filter((location) => supervised.includes(location.id)),
    ...active
      .filter(
        (location) =>
          location.customerId === firstCustomer &&
          !supervised.includes(location.id)
      )
      .slice(0, 4),
    ...active
      .filter(
        (location) =>
          !supervised.includes(location.id) &&
          location.customerId !== firstCustomer
      )
      .slice(0, 4),
  ]
  const frequencies: MockAuditPlan["frequency"][] = [
    "weekly",
    "biweekly",
    "monthly",
  ]
  const plans: MockAuditPlan[] = []
  chosen.forEach((location, index) => {
    const template = templateForLocation(templates, location)
    if (!template) return
    plans.push({
      id: `apl-${location.id}`,
      tenantId: tenant.slug,
      auditorId: supervised.includes(location.id)
        ? mockUserId(tenant.slug, "supervizor")
        : mockUserId(tenant.slug, "bolge"),
      locationId: location.id,
      templateId: template.id,
      frequency: frequencies[index % frequencies.length]!,
      startDate: AUDIT_HISTORY_START,
      isActive: true,
    })
  })
  db.auditPlans.insertMany(plans)

  for (const customer of data.customers.slice(0, 2)) {
    db.reportSubscriptions.insert({
      id: `rsub-${customer.id}`,
      tenantId: tenant.slug,
      customerId: customer.id,
      recipients: customer.contacts
        .map((contact) => contact.email)
        .filter((email): email is string => Boolean(email))
        .slice(0, 2),
      frequency: "monthly",
      includeSections: ["sla", "audits", "work_orders"],
      updatedAt,
      updatedBy: "Sistem",
    })
  }
}

export function versionAt(template: MockAuditTemplate, at: string) {
  const versions = template.versions.filter(
    (version) => version.publishedAt <= at
  )
  return versions.at(-1) ?? template.versions[0]!
}

const SCORE_STEPS: [threshold: number, score: number][] = [
  [0.4, 5],
  [0.75, 4],
  [0.92, 3],
  [0.98, 2],
  [1, 1],
]

function generatedAnswers(
  key: string,
  sections: MockAuditTemplate["versions"][number]["sections"]
): MockAuditAnswer[] {
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const r = rand(`${key}|${item.id}`)
      const base = { itemId: item.id, note: null, photoCount: 0 }
      switch (item.type) {
        case "note":
          return {
            ...base,
            passed: null,
            score: null,
            note: r < 0.3 ? "Genel durum iyi, ekip bilgilendirildi." : null,
          }
        case "score_1_5":
          return {
            ...base,
            passed: null,
            score: SCORE_STEPS.find(([threshold]) => r < threshold)?.[1] ?? 5,
          }
        case "photo_required":
        case "yes_no":
          return {
            ...base,
            passed: r > (item.critical ? 0.04 : 0.1),
            score: null,
            photoCount:
              item.type === "photo_required" ? 1 + (r > 0.5 ? 1 : 0) : 0,
          }
      }
    })
  )
}

export function buildAudit(
  tenant: MockTenant,
  input: {
    id: string
    template: MockAuditTemplate
    locationId: string
    auditorId: string | null
    auditorName: string
    performedAt: string
    answers: MockAuditAnswer[]
    generalNote: string | null
  }
): MockAudit {
  const version = versionAt(input.template, input.performedAt)
  const result = scoreAudit(
    version.sections,
    input.answers,
    qualityRules(tenant).auditPassScore
  )
  const counterKey = `audit:${tenant.slug}`
  const sequence = (ops.workOrderCounters.get(counterKey) ?? 0) + 1
  ops.workOrderCounters.set(counterKey, sequence)
  return {
    id: input.id,
    tenantId: tenant.slug,
    number: `DN-${input.performedAt.slice(0, 7).replace("-", "")}-${String(sequence).padStart(4, "0")}`,
    templateId: input.template.id,
    templateVersion: version.number,
    locationId: input.locationId,
    auditorId: input.auditorId,
    auditorName: input.auditorName,
    performedAt: input.performedAt,
    answers: input.answers,
    generalNote: input.generalNote,
    score: result.score,
    passed: result.passed,
    criticalFailures: result.criticalFailures,
  }
}

/** Denetimin kritik başarısız maddeleri için iş emri açar (madde başına bir tane) */
export function openAuditWorkOrders(
  tenant: MockTenant,
  audit: MockAudit,
  options: { closeIfOlderThan?: number } = {}
) {
  const template = db.auditTemplates.findById(audit.templateId)
  const location = db.locations.findById(audit.locationId)
  if (!template || !location) return []
  const version =
    template.versions.find((item) => item.number === audit.templateVersion) ??
    template.versions[0]!
  return workOrdersFromAudit(version.sections, audit.criticalFailures).map(
    (draft) => {
      const order = insertWorkOrder(tenant, {
        title: draft.title,
        description: `${audit.number} numaralı denetimde kritik madde başarısız.`,
        source: "audit_critical",
        priority: draft.priority,
        categoryCode: null,
        serviceLine: template.serviceLine,
        locationId: audit.locationId,
        areaId: null,
        createdAt: audit.performedAt,
        actorName: audit.auditorName,
        report: {
          receivedAt: audit.performedAt,
          channel: "audit",
          issueLabel: draft.title.replace(/^Denetim: /, ""),
          note: null,
          photoId: null,
        },
        auditId: audit.id,
        auditItemId: draft.itemId,
      })
      const closeAfter = options.closeIfOlderThan
      if (
        closeAfter !== undefined &&
        Date.parse(audit.performedAt) < closeAfter
      ) {
        const completedAt = new Date(
          Date.parse(audit.performedAt) + 3 * 3_600_000
        ).toISOString()
        db.workOrders.update(order.id, {
          status: "verified",
          completedAt,
          verifiedAt: completedAt,
          completionNote: "Düzeltildi.",
          history: [
            ...order.history,
            {
              at: completedAt,
              actorName: audit.auditorName,
              action: "Doğrulandı",
              note: null,
            },
          ],
        })
      }
      return order
    }
  )
}

/**
 * Denetim sonuçlarını plan yuvalarına göre bugüne kadar üretir (deterministik; yuvaların
 * ~%10'u atlanır, böylece plan raporunda gecikme görünür). Kritik başarısızlıklar iş emri
 * açar; 3 günden eski olanlar doğrulanmış olarak kapanır.
 */
function ensureAudits(tenant: MockTenant, now: Date): void {
  const today = toIsoDate(now)
  const until = ops.auditsGeneratedUntil.get(tenant.slug)
  if (until && until >= today) return
  const from = until ? addDaysIso(until, 1) : AUDIT_HISTORY_START
  ops.auditsGeneratedUntil.set(tenant.slug, today)
  const closeBefore = now.getTime() - 3 * 86_400_000
  const plans = db.auditPlans.findMany(
    (plan) => plan.tenantId === tenant.slug && plan.isActive
  )
  for (const plan of plans) {
    const template = db.auditTemplates.findById(plan.templateId)
    const auditor = plan.auditorId ? db.users.findById(plan.auditorId) : null
    if (!template) continue
    for (
      let month = monthOf(from);
      month <= monthOf(today);
      month = monthOf(addDaysIso(`${month}-28`, 7))
    ) {
      for (const slot of planSlots(plan.frequency, plan.startDate, month)) {
        const key = `${plan.id}|${slot.from}`
        if (rand(`${key}|skip`) < 0.1) continue
        const span = Math.max(
          0,
          Math.round(
            (Date.parse(`${slot.to}T00:00:00Z`) -
              Date.parse(`${slot.from}T00:00:00Z`)) /
              86_400_000
          )
        )
        const date = addDaysIso(slot.from, randInt(`${key}|day`, 0, span))
        if (date < from || date > today) continue
        const performed = istanbulDateTime(
          date,
          `${String(randInt(`${key}|h`, 9, 16)).padStart(2, "0")}:${pick(`${key}|m`, ["05", "20", "35", "50"])}`
        )
        if (performed > now) continue
        const id = `aud-${plan.id}-${date}`
        if (db.audits.findById(id)) continue
        const version = versionAt(template, performed.toISOString())
        const audit = db.audits.insert(
          buildAudit(tenant, {
            id,
            template,
            locationId: plan.locationId,
            auditorId: plan.auditorId,
            auditorName: auditor?.displayName ?? "Denetçi",
            performedAt: performed.toISOString(),
            answers: generatedAnswers(key, version.sections),
            generalNote: null,
          })
        )
        if (audit.criticalFailures.length > 0)
          openAuditWorkOrders(tenant, audit, { closeIfOlderThan: closeBefore })
      }
    }
  }
}

/** Panelde ve portalda çalışılacak, bugüne göre konumlanmış örnek iş emirleri */
function ensureSampleWorkOrders(tenant: MockTenant, now: Date): void {
  if (ops.workOrdersSeeded.has(tenant.slug)) return
  ops.workOrdersSeeded.add(tenant.slug)
  // Önce süpervizörün lokasyonları (panoda dolu görünsün), sonra planlı lokasyonlar
  const supervisor = db.users.findById(mockUserId(tenant.slug, "supervizor"))
  const supervised =
    supervisor?.scope.kind === "locations" ? supervisor.scope.ids : []
  const planned = db.auditPlans
    .findMany((plan) => plan.tenantId === tenant.slug)
    .map((plan) => plan.locationId)
  const locations = [...new Set([...supervised, ...planned])]
    .map((id) => db.locations.findById(id))
    .filter((location): location is MockLocation => Boolean(location))
  const catalog = db.issueCatalogs.findById(tenant.slug)?.items ?? []
  const samples: {
    hoursAgo: number
    status: "new" | "assigned" | "in_progress" | "completed" | "verified"
  }[] = [
    { hoursAgo: 0.3, status: "new" },
    { hoursAgo: 1.5, status: "new" },
    { hoursAgo: 3, status: "assigned" },
    { hoursAgo: 6, status: "in_progress" },
    { hoursAgo: 30, status: "assigned" },
    { hoursAgo: 20, status: "completed" },
    { hoursAgo: 50, status: "verified" },
    { hoursAgo: 80, status: "verified" },
  ]
  samples.forEach((sample, index) => {
    const location = locations[index % Math.max(locations.length, 1)]
    if (!location) return
    const areas = db.areas.findMany((area) => area.locationId === location.id)
    const area = areas[index % Math.max(areas.length, 1)] ?? null
    const issues = catalog.filter(
      (item) =>
        item.isActive &&
        location.serviceLines.includes(item.serviceLine) &&
        (!area || item.areaTypes.includes(area.type))
    )
    const issue = issues[index % Math.max(issues.length, 1)] ?? catalog[0]
    if (!issue) return
    const createdAt = new Date(
      now.getTime() - sample.hoursAgo * 3_600_000
    ).toISOString()
    const order = insertWorkOrder(tenant, {
      title: `${issue.label}${area ? ` · ${area.name}` : ""}`,
      description: null,
      source: index % 4 === 3 ? "manual" : "qr_feedback",
      priority: issue.priority,
      categoryCode: issue.code,
      serviceLine: issue.serviceLine,
      locationId: location.id,
      areaId: area?.id ?? null,
      createdAt,
      actorName: index % 4 === 3 ? "Hakan Çelik" : "QR bildirimi",
      report:
        index % 4 === 3
          ? undefined
          : {
              receivedAt: createdAt,
              channel: "qr",
              issueLabel: issue.label,
              note: null,
              photoId: null,
            },
    })
    if (sample.status === "new") return
    const assignee = db.personnel.findFirst(
      (person) =>
        person.homeLocationId === location.id && person.status === "active"
    )
    const at = (hours: number) =>
      new Date(Date.parse(createdAt) + hours * 3_600_000).toISOString()
    const completedAt =
      sample.status === "completed" || sample.status === "verified"
        ? at(Math.min(sample.hoursAgo - 0.5, index % 2 === 0 ? 0.8 : 30))
        : null
    db.workOrders.update(order.id, {
      status: sample.status,
      assigneeId: assignee?.id ?? null,
      completedAt,
      verifiedAt: sample.status === "verified" ? completedAt : null,
      completionNote: completedAt ? "Giderildi." : null,
      history: [
        ...order.history,
        { at: at(0.2), actorName: "Hakan Çelik", action: "Atandı", note: null },
        ...(completedAt
          ? [
              {
                at: completedAt,
                actorName: "Hakan Çelik",
                action: "Tamamlandı",
                note: null,
              },
            ]
          : []),
      ],
    })
  })
}

/** Kalite verisinin çalışma anında üretilen kısmı (denetim sonuçları, örnek iş emirleri) */
export function ensureQualityData(tenant: MockTenant, now: Date): void {
  ensureAudits(tenant, now)
  ensureSampleWorkOrders(tenant, now)
}
