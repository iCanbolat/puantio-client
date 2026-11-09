import { http } from "msw"
import * as XLSX from "xlsx"

import { buildMonthlyReport } from "@/features/customer-portal/domain/report"
import {
  reportSubscriptionInputSchema,
  type MonthlyReport,
} from "@/features/customer-portal/model/portal"
import {
  customerRequestSchema,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_SOURCE_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "@/features/work-orders/model/work-order"
import {
  isBreached,
  isOpen,
  slaCompliance,
} from "@/features/work-orders/domain/workflow"
import { addMonths, monthOf } from "@/shared/lib/work-time"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db } from "../db"
import {
  apiPath,
  created,
  fileResponse,
  notFound,
  ok,
  parseBody,
  problem,
} from "../http"
import { serializeAuditSummary, visibleAudits } from "./audit-handlers"
import { issuesFor } from "./feedback-handlers"
import { catalogFor, receiveReport, serializeWorkOrderSummary } from "./store"
import { visibleWorkOrders } from "./work-order-handlers"

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** Portal raporunun müşterisi: müşteri kullanıcısında kendi müşterisi, iç kullanıcıda `?customerId=` */
function reportCustomer(auth: AuthContext, request: Request) {
  const requested = new URL(request.url).searchParams.get("customerId")
  const id =
    auth.scope.kind === "customers" ? (auth.scope.ids[0] ?? null) : requested
  const customer = id ? db.customers.findById(id) : null
  if (!customer || !createScope(auth).customer(customer)) return null
  return customer
}

export function monthlyReport(
  auth: AuthContext,
  customerId: string,
  month: string
): MonthlyReport {
  const customer = db.customers.findById(customerId)
  const inCustomer = (locationId: string) =>
    db.locations.findById(locationId)?.customerId === customerId
  const report = buildMonthlyReport({
    month,
    workOrders: visibleWorkOrders(auth).filter((order) =>
      inCustomer(order.locationId)
    ),
    audits: visibleAudits(auth)
      .filter((item) => inCustomer(item.locationId))
      .map((item) => ({
        locationId: item.locationId,
        locationName: db.locations.findById(item.locationId)?.name ?? "—",
        score: item.score,
        passed: item.passed,
        criticalFailures: item.criticalFailures.length,
        performedAt: item.performedAt,
      })),
  })
  return {
    month,
    customerName: customer?.name ?? "—",
    generatedAt: mockClock.now().toISOString(),
    ...report,
  }
}

const percent = (value: number | null) =>
  value === null
    ? "—"
    : `%${(value * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`

export const portalHandlers = [
  http.get(
    apiPath("/portal/summary"),
    withAuth("portal:reports", ({ request, auth }) => {
      const customer = reportCustomer(auth, request)
      if (!customer) return notFound("Müşteri bulunamadı.")
      const now = mockClock.now().getTime()
      const since = now - 30 * 86_400_000
      const inCustomer = (locationId: string) =>
        db.locations.findById(locationId)?.customerId === customer.id
      const orders = visibleWorkOrders(auth).filter((order) =>
        inCustomer(order.locationId)
      )
      const recentClosed = orders.filter(
        (order) => order.completedAt && Date.parse(order.completedAt) >= since
      )
      const audits = visibleAudits(auth)
        .filter((item) => inCustomer(item.locationId))
        .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
      const recentAudits = audits.filter(
        (item) => Date.parse(item.performedAt) >= since
      )
      const open = orders.filter((order) => isOpen(order.status))
      return ok({
        customerName: customer.name,
        sla: slaCompliance(recentClosed),
        openWorkOrders: open.length,
        overdueWorkOrders: open.filter((order) => isBreached(order, now))
          .length,
        audits: {
          count: recentAudits.length,
          average:
            recentAudits.length === 0
              ? null
              : Math.round(
                  (recentAudits.reduce((sum, item) => sum + item.score, 0) /
                    recentAudits.length) *
                    10
                ) / 10,
          passed: recentAudits.filter((item) => item.passed).length,
        },
        recentOrders: open
          .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
          .slice(0, 5)
          .map((order) => serializeWorkOrderSummary(order)),
        recentAudits: audits.slice(0, 5).map(serializeAuditSummary),
      })
    })
  ),
  http.get(
    apiPath("/portal/request-options"),
    withAuth("work_order:request", ({ auth }) => {
      const scope = createScope(auth)
      const tenant = auth.tenant
      const locations = db.locations
        .findMany(
          (location) => scope.location(location) && location.status === "active"
        )
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
        .slice(0, 200)
      return ok({
        locations: locations.map((location) => ({
          id: location.id,
          code: location.code,
          name: location.name,
          serviceLines: location.serviceLines,
          areas: db.areas
            .findMany((area) => area.locationId === location.id)
            .map((area) => ({ id: area.id, name: area.name, type: area.type })),
        })),
        issues: catalogFor(tenant.slug)
          .filter((item) => item.isActive)
          .map((item) => ({
            code: item.code,
            label: item.label,
            serviceLine: item.serviceLine,
            areaTypes: item.areaTypes,
          })),
      })
    })
  ),
  http.post(
    apiPath("/portal/requests"),
    withAuth("work_order:request", async ({ request, auth }) => {
      const parsed = await parseBody(request, customerRequestSchema)
      if (!parsed.success) return parsed.response
      const data = parsed.data
      const location = db.locations.findById(data.locationId)
      // Başka müşterinin lokasyonu "bulunamadı" döner (varlığı sızdırılmaz)
      if (!location || !createScope(auth).location(location))
        return notFound("Lokasyon bulunamadı.")
      const area = data.areaId ? db.areas.findById(data.areaId) : null
      if (data.areaId && area?.locationId !== location.id)
        return problem(
          422,
          "VALIDATION_FAILED",
          "Alan bu lokasyona ait değil.",
          {
            areaId: ["Alan bu lokasyona ait değil"],
          }
        )
      const allowed = issuesFor({
        tenant: auth.tenant,
        location,
        area: area ?? null,
      })
      if (!allowed.some((item) => item.code === data.categoryCode))
        return problem(
          422,
          "VALIDATION_FAILED",
          "Bu alan için geçersiz sorun türü.",
          {
            categoryCode: ["Bu alan için geçersiz sorun türü"],
          }
        )
      const { order, merged } = receiveReport(auth.tenant, {
        locationId: location.id,
        areaId: area?.id ?? null,
        categoryCode: data.categoryCode,
        channel: "portal",
        note: data.note,
        photoId: null,
        receivedAt: mockClock.now().toISOString(),
        actorName: `${auth.actorName} (Portal)`,
        requestedBy: auth.user?.id ?? null,
      })
      audit(auth, {
        action: merged
          ? "Portal talebi mevcut iş emrine eklendi"
          : "Portal talebi açıldı",
        targetType: "work_order",
        targetLabel: order.number,
      })
      return created({ workOrderId: order.id, number: order.number, merged })
    })
  ),
  http.get(
    apiPath("/portal/reports"),
    withAuth("portal:reports", ({ auth, request }) => {
      if (!reportCustomer(auth, request)) return notFound("Müşteri bulunamadı.")
      const current = monthOf(mockClock.now())
      return ok({
        items: Array.from({ length: 7 }, (_, index) => {
          const month = addMonths(current, -index)
          return { month, partial: index === 0 }
        }),
      })
    })
  ),
  http.get(
    apiPath("/portal/reports/:month"),
    withAuth("portal:reports", ({ params, request, auth }) => {
      const month = String(params.month)
      if (!MONTH.test(month)) return notFound()
      const customer = reportCustomer(auth, request)
      if (!customer) return notFound("Müşteri bulunamadı.")
      return ok(monthlyReport(auth, customer.id, month))
    })
  ),
  http.get(
    apiPath("/portal/reports/:month/export"),
    withAuth("portal:reports", ({ params, request, auth }) => {
      const month = String(params.month)
      if (!MONTH.test(month)) return notFound()
      const customer = reportCustomer(auth, request)
      if (!customer) return notFound("Müşteri bulunamadı.")
      const report = monthlyReport(auth, customer.id, month)
      const inCustomer = (locationId: string) =>
        db.locations.findById(locationId)?.customerId === customer.id
      const orders = visibleWorkOrders(auth).filter(
        (order) =>
          inCustomer(order.locationId) && monthOf(order.createdAt) === month
      )
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([
          ["Müşteri", report.customerName],
          ["Dönem", month],
          ["Açılan iş emri", report.workOrders.opened],
          ["Kapanan iş emri", report.workOrders.closed],
          ["Süresinde kapanan", report.workOrders.onTime],
          ["SLA uyumu", percent(report.workOrders.slaRate)],
          ["Ay sonunda açık", report.workOrders.openAtMonthEnd],
          ["Denetim sayısı", report.audits.count],
          ["Ortalama denetim puanı", report.audits.average ?? "—"],
          ["Kritik bulgu", report.audits.criticalFailures],
        ]),
        "Özet"
      )
      // Power Apps / BI aktarımı için düz tablo (Açık Konu 6 netleşene kadar genel biçim)
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.json_to_sheet(
          orders.map((order) => {
            const summary = serializeWorkOrderSummary(order)
            return {
              "İş emri no": summary.number,
              Başlık: summary.title,
              Lokasyon: summary.locationName,
              Alan: summary.areaName ?? "",
              Kaynak: WORK_ORDER_SOURCE_LABELS[summary.source],
              Öncelik: WORK_ORDER_PRIORITY_LABELS[summary.priority],
              Durum: WORK_ORDER_STATUS_LABELS[summary.status],
              Açılış: summary.createdAt,
              "Son tarih": summary.dueAt,
              Tamamlanma: summary.completedAt ?? "",
              "SLA aşıldı": summary.slaBreached ? "Evet" : "Hayır",
            }
          })
        ),
        "İş emirleri"
      )
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.json_to_sheet(
          report.audits.byLocation.map((row) => ({
            Lokasyon: row.locationName,
            "Denetim sayısı": row.count,
            "Ortalama puan": row.average ?? "",
          }))
        ),
        "Denetimler"
      )
      const buffer = XLSX.write(book, {
        type: "array",
        bookType: "xlsx",
      }) as ArrayBuffer
      return fileResponse(
        buffer,
        `sla-denetim-raporu-${month}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    })
  ),
  http.get(
    apiPath("/portal/report-subscription"),
    withAuth("portal:reports", ({ request, auth }) => {
      const customer = reportCustomer(auth, request)
      if (!customer) return notFound("Müşteri bulunamadı.")
      const subscription = db.reportSubscriptions.findFirst(
        (item) =>
          item.tenantId === auth.tenant.slug && item.customerId === customer.id
      )
      return ok(
        subscription
          ? {
              recipients: subscription.recipients,
              frequency: subscription.frequency,
              includeSections: subscription.includeSections,
              updatedAt: subscription.updatedAt,
              updatedBy: subscription.updatedBy,
            }
          : {
              recipients: [],
              frequency: "off",
              includeSections: ["sla", "audits"],
              updatedAt: null,
              updatedBy: null,
            }
      )
    })
  ),
  http.put(
    apiPath("/portal/report-subscription"),
    withAuth("portal:report_settings", async ({ request, auth }) => {
      const customer = reportCustomer(auth, request)
      if (!customer) return notFound("Müşteri bulunamadı.")
      const parsed = await parseBody(request, reportSubscriptionInputSchema)
      if (!parsed.success) return parsed.response
      const now = mockClock.now().toISOString()
      const existing = db.reportSubscriptions.findFirst(
        (item) =>
          item.tenantId === auth.tenant.slug && item.customerId === customer.id
      )
      const values = {
        ...parsed.data,
        updatedAt: now,
        updatedBy: auth.actorName,
      }
      if (existing) db.reportSubscriptions.update(existing.id, values)
      else
        db.reportSubscriptions.insert({
          id: `rsub-${customer.id}`,
          tenantId: auth.tenant.slug,
          customerId: customer.id,
          ...values,
        })
      audit(auth, {
        action: "Rapor gönderim ayarları güncellendi",
        targetType: "report_subscription",
        targetLabel: customer.name,
      })
      return ok(values)
    })
  ),
]
