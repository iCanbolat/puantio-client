import { AREA_TYPE_LABELS } from "@/entities/location"
import { DEFAULT_QUALITY_RULES, type QualityRules } from "@/entities/tenant"
import {
  dueAtFor,
  findMergeTarget,
  isBreached,
} from "@/features/work-orders/domain/workflow"
import type {
  WorkOrder,
  WorkOrderSummary,
} from "@/features/work-orders/model/work-order"

import { mockClock } from "../clock"
import { db } from "../db"
import type { MockWorkOrder, MockWorkOrderReport } from "../db/types"
import { apiPath } from "../http"
import { ops } from "../operations/store"
import { broadcastEvent } from "../realtime"
import type { MockTenant } from "../tenancy/tenants"

export const qualityRules = (tenant: { rules: { quality?: QualityRules } }) =>
  tenant.rules.quality ?? DEFAULT_QUALITY_RULES

/** İmzalı, 5 dk geçerli dosya adresi (gerçekte nesne deposu ön imzalı URL) */
export function signedFileUrl(kind: "quality-photos", id: string): string {
  const expires = mockClock.now().getTime() + 5 * 60_000
  return `${apiPath(`/files/${kind}/${encodeURIComponent(id)}`)}?exp=${String(expires)}&sig=${id.length.toString(16)}${String(expires).slice(-6)}`
}

export function nextWorkOrderNumber(tenantId: string, at: string): string {
  const next = (ops.workOrderCounters.get(tenantId) ?? 0) + 1
  ops.workOrderCounters.set(tenantId, next)
  return `İE-${at.slice(0, 4)}-${String(next).padStart(5, "0")}`
}

export function catalogFor(tenantId: string) {
  return db.issueCatalogs.findById(tenantId)?.items ?? []
}

export function workOrderEvent(
  type: "work_order.created" | "work_order.updated",
  order: MockWorkOrder
): void {
  broadcastEvent(type, {
    tenantId: order.tenantId,
    workOrderId: order.id,
    locationId: order.locationId,
  })
}

export interface NewWorkOrder {
  title: string
  description: string | null
  source: MockWorkOrder["source"]
  priority: MockWorkOrder["priority"]
  categoryCode: string | null
  serviceLine: MockWorkOrder["serviceLine"]
  locationId: string
  areaId: string | null
  createdAt: string
  actorName: string
  report?: Omit<MockWorkOrderReport, "id"> | undefined
  auditId?: string | null
  auditItemId?: string | null
  requestedBy?: string | null
}

export function insertWorkOrder(tenant: MockTenant, input: NewWorkOrder) {
  const order = db.workOrders.insert({
    id: `wo-${tenant.slug}-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: tenant.slug,
    number: nextWorkOrderNumber(tenant.slug, input.createdAt),
    title: input.title,
    description: input.description,
    source: input.source,
    status: "new",
    priority: input.priority,
    categoryCode: input.categoryCode,
    serviceLine: input.serviceLine,
    locationId: input.locationId,
    areaId: input.areaId,
    assigneeId: null,
    createdAt: input.createdAt,
    dueAt: dueAtFor(input.createdAt, input.priority, qualityRules(tenant)),
    completedAt: null,
    verifiedAt: null,
    lastReportAt: input.report?.receivedAt ?? input.createdAt,
    reports: input.report
      ? [{ id: `rep-${crypto.randomUUID().slice(0, 8)}`, ...input.report }]
      : [],
    history: [
      {
        at: input.createdAt,
        actorName: input.actorName,
        action: "İş emri oluşturuldu",
        note: null,
      },
    ],
    completionNote: null,
    completionPhotoId: null,
    cancelReason: null,
    auditId: input.auditId ?? null,
    auditItemId: input.auditItemId ?? null,
    requestedBy: input.requestedBy ?? null,
  })
  return order
}

/**
 * Bildirimi iş emrine dönüştürür: pencere içinde aynı alan + sorun için açık iş emri varsa
 * ona eklenir (birleştirme), yoksa yeni iş emri açılır.
 */
export function receiveReport(
  tenant: MockTenant,
  input: {
    locationId: string
    areaId: string | null
    categoryCode: string
    channel: MockWorkOrderReport["channel"]
    note: string | null
    photoId: string | null
    receivedAt: string
    actorName: string
    requestedBy?: string | null
  }
): { order: MockWorkOrder; merged: boolean } {
  const entry = catalogFor(tenant.slug).find(
    (item) => item.code === input.categoryCode
  )
  const label = entry?.label ?? "Diğer"
  const report = {
    receivedAt: input.receivedAt,
    channel: input.channel,
    issueLabel: label,
    note: input.note,
    photoId: input.photoId,
  }
  const target = findMergeTarget(
    db.workOrders.findMany(
      (item) =>
        item.tenantId === tenant.slug && item.locationId === input.locationId
    ),
    { ...input, receivedAt: input.receivedAt },
    qualityRules(tenant).feedbackMergeMinutes
  )
  if (target) {
    const updated = db.workOrders.update(target.id, {
      lastReportAt: input.receivedAt,
      reports: [
        ...target.reports,
        { id: `rep-${crypto.randomUUID().slice(0, 8)}`, ...report },
      ],
      history: [
        ...target.history,
        {
          at: input.receivedAt,
          actorName: input.actorName,
          action: "Yeni bildirim eklendi",
          note: input.note,
        },
      ],
    })!
    workOrderEvent("work_order.updated", updated)
    return { order: updated, merged: true }
  }
  const area = input.areaId ? db.areas.findById(input.areaId) : null
  const location = db.locations.findById(input.locationId)
  const order = insertWorkOrder(tenant, {
    title: `${label}${area ? ` · ${area.name}` : ""}`,
    description: input.note,
    source: input.channel === "portal" ? "customer_request" : "qr_feedback",
    priority: entry?.priority ?? "normal",
    categoryCode: input.categoryCode,
    serviceLine: entry?.serviceLine ?? location?.serviceLines[0] ?? "cleaning",
    locationId: input.locationId,
    areaId: input.areaId,
    createdAt: input.receivedAt,
    actorName: input.actorName,
    report,
    requestedBy: input.requestedBy ?? null,
  })
  workOrderEvent("work_order.created", order)
  return { order, merged: false }
}

function personName(id: string | null): string | null {
  if (!id) return null
  const person = db.personnel.findById(id)
  return person ? `${person.firstName} ${person.lastName}` : null
}

export function serializeWorkOrderSummary(
  order: MockWorkOrder,
  now: number = mockClock.now().getTime()
): WorkOrderSummary {
  const location = db.locations.findById(order.locationId)
  const customer = location ? db.customers.findById(location.customerId) : null
  const area = order.areaId ? db.areas.findById(order.areaId) : null
  return {
    id: order.id as WorkOrderSummary["id"],
    number: order.number,
    title: order.title,
    source: order.source,
    status: order.status,
    priority: order.priority,
    categoryCode: order.categoryCode,
    serviceLine: order.serviceLine,
    locationId: order.locationId,
    locationCode: location?.code ?? "—",
    locationName: location?.name ?? "—",
    customerId: location?.customerId ?? "",
    customerName: customer?.name ?? "—",
    areaId: order.areaId,
    areaName: area ? `${area.name} (${AREA_TYPE_LABELS[area.type]})` : null,
    assigneeId: order.assigneeId,
    assigneeName: personName(order.assigneeId),
    reportCount: Math.max(order.reports.length, 1),
    createdAt: order.createdAt,
    dueAt: order.dueAt,
    completedAt: order.completedAt,
    slaBreached: isBreached(order, now),
  }
}

export function serializeWorkOrder(
  order: MockWorkOrder,
  options: { internal: boolean }
): WorkOrder {
  return {
    ...serializeWorkOrderSummary(order),
    // Müşteri portalında personel adı yerine "Ekip" gösterilir (KVKK: veri minimizasyonu)
    assigneeName: options.internal
      ? personName(order.assigneeId)
      : order.assigneeId
        ? "Saha ekibi"
        : null,
    description: order.description,
    reports: order.reports.map((report) => ({
      id: report.id,
      receivedAt: report.receivedAt,
      channel: report.channel,
      issueLabel: report.issueLabel,
      note: report.note,
      photoUrl: report.photoId
        ? signedFileUrl("quality-photos", report.photoId)
        : null,
    })),
    history: options.internal
      ? order.history
      : order.history.map((event) => ({
          ...event,
          actorName: event.actorName.includes("Portal")
            ? event.actorName
            : "Hizmet ekibi",
        })),
    completionNote: order.completionNote,
    completionPhotoUrl: order.completionPhotoId
      ? signedFileUrl("quality-photos", order.completionPhotoId)
      : null,
    verifiedAt: order.verifiedAt,
    cancelReason: order.cancelReason,
    auditId: options.internal ? order.auditId : null,
  }
}
