import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { z } from "zod"

import {
  monthlyReportSchema,
  portalSummarySchema,
  reportSubscriptionSchema,
  requestReceiptSchema,
} from "@/features/customer-portal/model/portal"
import {
  feedbackReceiptSchema,
  publicFeedbackTargetSchema,
} from "@/features/public-feedback/model/feedback"
import {
  auditListSchema,
  auditPlanSchema,
  auditSchema,
  auditTemplateSchema,
  auditTrendSchema,
} from "@/features/quality-audit/model/audit"
import { timesheetPeriodListSchema } from "@/features/timesheet/model/timesheet"
import {
  issueCatalogSchema,
  workOrderBoardSchema,
  workOrderListSchema,
  workOrderSchema,
} from "@/features/work-orders/model/work-order"
import { ApiError } from "@/shared/api/errors"
import { configureHttp, http, resetHttpConfig } from "@/shared/api/http"
import { applyTestScenario } from "@/test/scenario"

import { identityFor } from "./auth/identities"
import { mintMockToken } from "./auth/token"
import { mockClock } from "./clock"
import { db } from "./db"
import { addStaffingContract } from "./contracts/testing"
import {
  FLOOD_REPORTS,
  PORTAL_REPORT_MONTH,
  feedbackDemoAreaId,
  feedbackDemoToken,
  portalReportCustomerId,
} from "./scenarios/phase4"

const TENANT = "temizlik-orta"
const OCTOBER = "2026-10-05T10:00:00+03:00"
const any = z.unknown()

function signIn(tenant: string, user: string) {
  const identity = identityFor(tenant, user)
  const token = mintMockToken({
    organization: identity.organization,
    userId: identity.userId,
    expiresAt: Date.now() + 3_600_000,
  })
  configureHttp({ getAccessToken: () => token })
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((caught: unknown) => caught)
  if (!(error instanceof ApiError)) throw new Error("ApiError bekleniyordu")
  return error
}

function feedbackForm(fields: Record<string, string | File>) {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  return body
}

const sendFeedback = (token: string, fields: Record<string, string | File>) =>
  http.post(`/public/feedback/${token}`, feedbackReceiptSchema, {
    body: feedbackForm(fields),
  })

describe("Faz 4 mock API sözleşmesi", () => {
  describe("public QR bildirimi", () => {
    it("TC-4.3-01 oturumsuz geçerli token: alan, marka ve alan tipine uyan sorunlar; gönderim iş emri açar", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("quality-demo")
      resetHttpConfig()
      const token = feedbackDemoToken(TENANT)
      const target = await http.get(
        `/public/feedback/${token}`,
        publicFeedbackTargetSchema
      )
      expect(target.area).toEqual({
        name: "Zemin kat WC",
        typeLabel: "Tuvalet / lavabo",
        floor: "Zemin",
      })
      expect(target.tenant.displayName).toBe("Lavanta Tesis Hizmetleri")
      expect(target.areaTerm).toBe("Alan")
      const codes = target.issues.map((issue) => issue.code)
      expect(codes).toEqual(
        expect.arrayContaining(["paper_towel", "soap", "dirty"])
      )
      // Tuvalette teknik/peyzaj sorunları yok (lokasyonun hizmet hattı temizlik + ilaçlama)
      expect(codes).not.toContain("garden_care")
      expect(target.cooldownMinutes).toBe(2)

      // Not: jsdom FormData'sı Node fetch'e dosya aktaramaz; fotoğraflı gönderim E2E-4.1'de
      const receipt = await sendFeedback(token, {
        issueCode: "soap",
        note: "Sol lavabo",
        requestId: "req-1",
        deviceId: "cihaz-1",
      })
      expect(receipt.merged).toBe(false)
      const order = db.workOrders.findFirst(
        (item) => item.number === receipt.reference
      )!
      expect(order).toMatchObject({
        source: "qr_feedback",
        status: "new",
        priority: "high",
        categoryCode: "soap",
        areaId: feedbackDemoAreaId(TENANT),
        dueAt: "2026-10-05T11:00:00.000Z",
      })
      expect(order.reports[0]).toMatchObject({
        channel: "qr",
        note: "Sol lavabo",
        photoId: null,
      })
    })

    it("TC-4.3-02 iptal edilmiş token 410, bilinmeyen token 404; modül kapalı kiracıda 404", async () => {
      applyTestScenario("quality-demo")
      const revoked = await failure(
        http.get(`/public/feedback/${feedbackDemoToken(TENANT)}-ESKI`, any)
      )
      expect([revoked.status, revoked.code]).toEqual([410, "TOKEN_REVOKED"])
      const unknown = await failure(http.get("/public/feedback/YOKBOYLE", any))
      expect([unknown.status, unknown.code]).toEqual([404, "TOKEN_NOT_FOUND"])
      db.tenants.update(TENANT, {
        modules: db.tenants
          .findById(TENANT)!
          .modules.filter((item) => item !== "quality"),
      })
      const disabled = await failure(
        http.get(`/public/feedback/${feedbackDemoToken(TENANT)}`, any)
      )
      expect(disabled.status).toBe(404)
    })

    it("TC-4.3-03 aynı istek kimliği iki kez gelirse tek bildirim; TC-4.3-05 aynı cihaza bekleme süresi (429)", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("quality-demo")
      const token = feedbackDemoToken(TENANT)
      const fields = {
        issueCode: "dirty",
        requestId: "req-cift",
        deviceId: "cihaz-1",
      }
      const [first, second] = await Promise.all([
        sendFeedback(token, fields),
        sendFeedback(token, fields),
      ])
      expect(second.reference).toBe(first.reference)
      expect(db.feedbackSubmissions.count((item) => item.token === token)).toBe(
        1
      )
      const order = db.workOrders.findFirst(
        (item) => item.number === first.reference
      )!
      expect(order.reports).toHaveLength(1)

      const cooldown = await failure(
        sendFeedback(token, { ...fields, requestId: "req-2" })
      )
      expect([cooldown.status, cooldown.code]).toEqual([429, "COOLDOWN"])
      // Başka cihaz bekleme süresine takılmaz; aynı sorun açık iş emrine eklenir
      const other = await sendFeedback(token, {
        ...fields,
        requestId: "req-3",
        deviceId: "cihaz-2",
      })
      expect(other).toEqual({ reference: first.reference, merged: true })
      // Süre dolunca aynı cihaz tekrar gönderebilir
      mockClock.freeze("2026-10-05T10:02:30+03:00")
      await sendFeedback(token, { ...fields, requestId: "req-4" })
      // Geçersiz sorun kodu
      const invalid = await failure(
        sendFeedback(token, {
          issueCode: "garden_care",
          requestId: "req-5",
          deviceId: "cihaz-3",
        })
      )
      expect(invalid.status).toBe(422)
    })
  })

  describe("iş emirleri", () => {
    it("TC-4.4-01 qr-report-flood: aynı alandan 5 bildirim tek iş emrinde birleşir", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("qr-report-flood")
      signIn(TENANT, "supervizor")
      const orders = db.workOrders.findMany(
        (item) =>
          item.tenantId === TENANT && item.areaId === feedbackDemoAreaId(TENANT)
      )
      expect(orders).toHaveLength(1)
      const detail = await http.get(
        `/work-orders/${orders[0]!.id}`,
        workOrderSchema
      )
      expect(detail.reportCount).toBe(FLOOD_REPORTS)
      expect(detail.reports).toHaveLength(FLOOD_REPORTS)
      expect(detail.title).toBe("Kağıt havlu bitti · Zemin kat WC")
      expect(detail.createdAt).toBe("2026-10-05T06:50:00.000Z")
      // 30 dk pencere son bildirimden itibaren işler: 31 dk sonra gelen yeni iş emri açar
      mockClock.freeze("2026-10-05T10:31:00+03:00")
      resetHttpConfig()
      const late = await sendFeedback(feedbackDemoToken(TENANT), {
        issueCode: "paper_towel",
        requestId: "req-late",
        deviceId: "cihaz-9",
      })
      expect(late.merged).toBe(false)
    })

    it("TC-4.4-02 work-order-sla-breach: SLA'sı aşılanlar listenin başında ve işaretli", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("work-order-sla-breach")
      signIn(TENANT, "supervizor")
      const list = await http.get("/work-orders", workOrderListSchema, {
        params: { state: "open", pageSize: 50 },
      })
      const breached = list.items.filter((item) => item.slaBreached)
      expect(
        list.items.slice(0, breached.length).every((item) => item.slaBreached)
      ).toBe(true)
      expect(list.items[0]!.title).toBe("SLA aşımı: Su kaçağı")
      expect(list.items[1]!.title).toBe("SLA aşımı: Aydınlatma arızası")
      const overdue = await http.get("/work-orders", workOrderListSchema, {
        params: { state: "overdue" },
      })
      expect(overdue.items.every((item) => item.slaBreached)).toBe(true)
      expect(overdue.items.map((item) => item.title)).toContain(
        "SLA aşımı: Su kaçağı"
      )
      expect(overdue.items.map((item) => item.title)).not.toContain(
        "Zamanında: Cam silme"
      )
      const board = await http.get("/work-orders/board", workOrderBoardSchema)
      expect(board.items.every((item) => item.status !== "cancelled")).toBe(
        true
      )
    })

    it("TC-4.4-03 geçersiz geçiş 409, atama/tamamlama doğrulaması, kapsam dışı 404", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("work-order-sla-breach")
      signIn(TENANT, "supervizor")
      const order = db.workOrders.findFirst(
        (item) => item.title === "Zamanında: Cam silme"
      )!
      const transition = (body: Record<string, unknown>) =>
        http.post(`/work-orders/${order.id}/transition`, workOrderSchema, {
          body,
        })
      const invalid = await failure(
        transition({ action: "complete", photoId: "x" })
      )
      expect([invalid.status, invalid.code]).toEqual([
        409,
        "INVALID_TRANSITION",
      ])
      const noAssignee = await failure(transition({ action: "assign" }))
      expect(noAssignee.status).toBe(422)
      const person = db.personnel.findFirst(
        (item) =>
          item.tenantId === TENANT &&
          item.homeLocationId === order.locationId &&
          item.status === "active"
      )!
      expect(
        (await transition({ action: "assign", assigneeId: person.id })).status
      ).toBe("assigned")
      expect((await transition({ action: "start" })).status).toBe("in_progress")
      const noPhoto = await failure(transition({ action: "complete" }))
      expect(noPhoto.fieldErrors?.photoId).toBeDefined()
      // Yükleme ucu E2E-4.1'de gerçek dosyayla çalışır; burada kaydı doğrudan oluştur
      const upload = db.uploads.insert({
        id: "up-test-1",
        tenantId: TENANT,
        name: "bitti.jpg",
        contentType: "image/jpeg",
        size: 1,
        createdAt: OCTOBER,
      })
      const foreign = db.uploads.insert({
        ...upload,
        id: "up-baska",
        tenantId: "guvenlik",
      })
      const wrongTenant = await failure(
        transition({ action: "complete", photoId: foreign.id })
      )
      expect(wrongTenant.fieldErrors?.photoId).toBeDefined()
      const completed = await transition({
        action: "complete",
        photoId: upload.id,
        note: "Silindi",
      })
      expect(completed.completionPhotoUrl).toContain("/files/quality-photos/")
      expect(completed.completedAt).toBe("2026-10-05T07:00:00.000Z")
      const reopenNoReason = await failure(
        transition({ action: "reopen", note: "x" })
      )
      expect(reopenNoReason.status).toBe(422)
      const verified = await transition({ action: "verify" })
      expect(verified.status).toBe("verified")
      expect(verified.history.map((event) => event.action)).toEqual([
        "İş emri oluşturuldu",
        `Atandı: ${person.firstName} ${person.lastName}`,
        "Müdahaleye başla",
        "Tamamla",
        "Doğrula",
      ])
      // Kapsam dışı (başka bölge) iş emri bulunamaz
      const outside = db.workOrders.findFirst(
        (item) =>
          item.tenantId === TENANT &&
          ![
            "loc-temizlik-orta-1",
            "loc-temizlik-orta-4",
            "loc-temizlik-orta-7",
          ].includes(item.locationId)
      )
      if (outside) {
        const hidden = await failure(
          http.get(`/work-orders/${outside.id}`, any)
        )
        expect(hidden.status).toBe(404)
      }
      // İK iş emirlerine erişemez
      signIn(TENANT, "ik")
      expect((await failure(http.get("/work-orders", any))).status).toBe(403)
    })

    it("manuel iş emri: lokasyon kapsamı ve alan doğrulaması", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("quality-demo")
      signIn(TENANT, "supervizor")
      const created = await http.post("/work-orders", workOrderSchema, {
        body: {
          title: "Cam silme",
          description: null,
          locationId: "loc-temizlik-orta-1",
          areaId: feedbackDemoAreaId(TENANT),
          priority: "low",
          serviceLine: "cleaning",
        },
      })
      expect(created).toMatchObject({
        source: "manual",
        status: "new",
        dueAt: "2026-10-08T07:00:00.000Z",
      })
      const wrongArea = await failure(
        http.post("/work-orders", any, {
          body: {
            title: "Cam",
            description: null,
            locationId: "loc-temizlik-orta-4",
            areaId: feedbackDemoAreaId(TENANT),
            priority: "low",
            serviceLine: "cleaning",
          },
        })
      )
      expect(wrongArea.fieldErrors?.areaId).toBeDefined()
    })
  })

  describe("denetim şablonları, sonuçlar ve plan", () => {
    it("TC-4.1-01 sunucu da ağırlık toplamını doğrular (422); TC-4.1-03 hazır şablon 409, çoğaltılan düzenlenir ve sürüm artar", async () => {
      signIn(TENANT, "supervizor")
      const builtIn = await http.get(
        `/audit-templates/ats-${TENANT}-cleaning-office`,
        auditTemplateSchema
      )
      expect(builtIn.builtIn).toBe(true)
      const input = {
        name: builtIn.name,
        description: builtIn.description,
        serviceLine: builtIn.serviceLine,
        sectors: builtIn.sectors,
        sections: builtIn.sections,
        isActive: true,
      }
      const locked = await failure(
        http.put(`/audit-templates/${builtIn.id}`, any, { body: input })
      )
      expect([locked.status, locked.code]).toEqual([409, "BUILT_IN"])
      const copy = await http.post("/audit-templates", auditTemplateSchema, {
        body: { ...input, name: "Ofis (kopya)" },
      })
      expect(copy).toMatchObject({ builtIn: false, version: 1 })
      const broken = structuredClone(input)
      broken.sections[0]!.items[0]!.weight = 5
      const invalid = await failure(
        http.put(`/audit-templates/${copy.id}`, any, { body: broken })
      )
      expect(invalid.status).toBe(422)
      expect(invalid.message).toBe("Ağırlık toplamı 100 olmalı (şu an 90)")
      // Yalnızca ad değişirse sürüm artmaz; maddeler değişirse yeni sürüm
      const renamed = await http.put(
        `/audit-templates/${copy.id}`,
        auditTemplateSchema,
        {
          body: { ...input, name: "Ofis standardı" },
        }
      )
      expect(renamed.version).toBe(1)
      const changed = structuredClone(input)
      changed.sections[0]!.items[0]!.weight = 10
      changed.sections[0]!.items[1]!.weight = 20
      const v2 = await http.put(
        `/audit-templates/${copy.id}`,
        auditTemplateSchema,
        { body: changed }
      )
      expect(v2.version).toBe(2)
      expect(v2.versions.map((version) => version.number)).toEqual([1, 2])
      // Bölge sorumlusu şablon düzenleyemez
      signIn(TENANT, "bolge")
      expect(
        (
          await failure(
            http.put(`/audit-templates/${copy.id}`, any, { body: input })
          )
        ).status
      ).toBe(403)
    })

    it("TC-4.1-02 kritik maddesi başarısız denetim iş emri açar; denetim detayı bağlantıyı gösterir", async () => {
      mockClock.freeze(OCTOBER)
      signIn(TENANT, "supervizor")
      const template = await http.get(
        `/audit-templates/ats-${TENANT}-cleaning-bank`,
        auditTemplateSchema
      )
      const answers = template.sections.flatMap((section) =>
        section.items.map((item) => ({
          itemId: item.id,
          passed:
            item.type === "yes_no" || item.type === "photo_required"
              ? !item.text.startsWith("ATM")
              : null,
          score: item.type === "score_1_5" ? 5 : null,
          note: null,
          photoCount: item.type === "photo_required" ? 1 : 0,
        }))
      )
      const audit = await http.post("/audits", auditSchema, {
        body: {
          templateId: template.id,
          locationId: "loc-temizlik-orta-1",
          performedAt: "2026-10-05T09:30:00+03:00",
          answers,
          generalNote: null,
        },
      })
      // ATM maddesi (ağırlık 20, kritik) başarısız: puan 80 ama denetim başarısız
      expect(audit.score).toBe(80)
      expect(audit.passed).toBe(false)
      expect(audit.criticalFailures).toBe(1)
      expect(audit.workOrders).toHaveLength(1)
      const order = await http.get(
        `/work-orders/${audit.workOrders[0]!.id}`,
        workOrderSchema
      )
      expect(order).toMatchObject({
        source: "audit_critical",
        priority: "high",
        auditId: audit.id,
      })
      expect(
        audit.answers.find((answer) => answer.photoUrls.length > 0)
          ?.photoUrls[0]
      ).toContain("exp=")
      // Kapsam dışı lokasyona denetim gönderilemez
      const outside = await failure(
        http.post("/audits", any, {
          body: {
            templateId: template.id,
            locationId: "loc-temizlik-orta-2",
            performedAt: OCTOBER,
            answers,
            generalNote: null,
          },
        })
      )
      expect(outside.status).toBe(404)
    })

    it("TC-4.2-01 plan: planlanan/gerçekleşen/eksik; trend ve liste kapsamı", async () => {
      mockClock.freeze(OCTOBER)
      signIn(TENANT, "admin")
      const plan = await http.get("/audit-plans", auditPlanSchema, {
        params: { ay: "2026-09" },
      })
      expect(plan.items.length).toBeGreaterThan(1)
      for (const row of plan.items) {
        expect(row.done + row.missing).toBeLessThanOrEqual(row.planned)
        // Eylül bitti: yapılmayan her yuva eksik
        expect(row.done + row.missing).toBe(row.planned)
      }
      expect(plan.totals.planned).toBe(
        plan.items.reduce((sum, row) => sum + row.planned, 0)
      )
      const duplicate = plan.items[0]!
      const conflict = await failure(
        http.post("/audit-plans", any, {
          body: {
            auditorId: duplicate.auditorId,
            locationId: duplicate.locationId,
            templateId: duplicate.templateId,
            frequency: "weekly",
            startDate: "2026-10-01",
          },
        })
      )
      expect(conflict.status).toBe(409)

      const trend = await http.get("/audits/trend", auditTrendSchema, {
        params: { months: 4 },
      })
      expect(trend.overall.map((point) => point.month)).toEqual([
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
      ])
      expect(trend.overall[1]!.count).toBeGreaterThan(0)

      signIn(TENANT, "supervizor")
      const audits = await http.get("/audits", auditListSchema, {
        params: { pageSize: 100 },
      })
      const allowed = [
        "loc-temizlik-orta-1",
        "loc-temizlik-orta-4",
        "loc-temizlik-orta-7",
      ]
      expect(
        audits.items.every((item) => allowed.includes(item.locationId))
      ).toBe(true)
      const critical = await http.get("/audits", auditListSchema, {
        params: { result: "critical" },
      })
      expect(critical.items.every((item) => item.criticalFailures > 0)).toBe(
        true
      )
    })

    it("bildirim kataloğu: kod benzersiz olmalı; güncelleme QR sayfasına yansır", async () => {
      applyTestScenario("quality-demo")
      signIn(TENANT, "supervizor")
      const catalog = await http.get("/issue-catalog", issueCatalogSchema)
      const duplicated = await failure(
        http.put("/issue-catalog", any, {
          body: { items: [...catalog.items, catalog.items[0]] },
        })
      )
      expect(duplicated.status).toBe(422)
      await http.put("/issue-catalog", issueCatalogSchema, {
        body: {
          items: catalog.items.map((item) =>
            item.code === "soap" ? { ...item, isActive: false } : item
          ),
        },
      })
      resetHttpConfig()
      const target = await http.get(
        `/public/feedback/${feedbackDemoToken(TENANT)}`,
        publicFeedbackTargetSchema
      )
      expect(target.issues.map((issue) => issue.code)).not.toContain("soap")
    })
  })

  describe("müşteri portalı", () => {
    it("TC-4.5-01 müşteri A kullanıcısı B'nin lokasyonunu ve iş emrini göremez (404)", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("quality-demo")
      signIn(TENANT, "musteri-b")
      // A müşterisinin lokasyonundaki iş emri
      const customerA = portalReportCustomerId(TENANT)!
      const orderA =
        db.workOrders.findFirst(
          (item) =>
            db.locations.findById(item.locationId)?.customerId === customerA
        ) ??
        (await (async () => {
          signIn(TENANT, "musteri")
          const location = db.locations.findFirst(
            (item) => item.customerId === customerA
          )!
          const receipt = await http.post(
            "/portal/requests",
            requestReceiptSchema,
            {
              body: {
                locationId: location.id,
                areaId: null,
                categoryCode: "other",
                note: null,
              },
            }
          )
          signIn(TENANT, "musteri-b")
          return db.workOrders.findById(receipt.workOrderId)!
        })())
      expect(
        (await failure(http.get(`/work-orders/${orderA.id}`, any))).status
      ).toBe(404)
      const list = await http.get("/work-orders", workOrderListSchema, {
        params: { pageSize: 100 },
      })
      expect(list.items.some((item) => item.customerId === customerA)).toBe(
        false
      )
      const request = await failure(
        http.post("/portal/requests", any, {
          body: {
            locationId: orderA.locationId,
            areaId: null,
            categoryCode: "other",
            note: null,
          },
        })
      )
      expect(request.status).toBe(404)
      const audit = db.audits.findFirst(
        (item) =>
          db.locations.findById(item.locationId)?.customerId === customerA
      )
      if (audit)
        expect(
          (await failure(http.get(`/audits/${audit.id}`, any))).status
        ).toBe(404)
      // Portalda iç bilgiler maskelenir
      signIn(TENANT, "musteri")
      const own = await http.get(`/work-orders/${orderA.id}`, workOrderSchema)
      expect(own.auditId).toBeNull()
      expect(
        own.history.every(
          (event) =>
            event.actorName === "Hizmet ekibi" ||
            event.actorName.includes("Portal")
        )
      ).toBe(true)
    })

    it("TC-4.5-02 aylık rapor rakamları fixture agregasyonuyla birebir; Excel özeti aynı", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("portal-month-report")
      signIn(TENANT, "musteri")
      const report = await http.get(
        `/portal/reports/${PORTAL_REPORT_MONTH}`,
        monthlyReportSchema
      )
      expect(report.workOrders).toEqual({
        opened: 6,
        closed: 4,
        onTime: 2,
        slaRate: 0.5,
        averageResolutionMinutes: 945,
        openAtMonthEnd: 2,
        bySource: {
          qr_feedback: 2,
          audit_critical: 1,
          manual: 2,
          customer_request: 1,
        },
        byPriority: { urgent: 1, high: 2, normal: 2, low: 1 },
      })
      expect(report.audits).toMatchObject({
        count: 4,
        average: 81.4,
        passed: 2,
        criticalFailures: 2,
      })
      expect(
        report.audits.byLocation.reduce((sum, row) => sum + row.count, 0)
      ).toBe(4)

      const { blob } = await http.getBlob(
        `/portal/reports/${PORTAL_REPORT_MONTH}/export`
      )
      const book = XLSX.read(await blob.arrayBuffer())
      const summary = XLSX.utils.sheet_to_json<[string, unknown]>(
        book.Sheets["Özet"]!,
        { header: 1 }
      )
      expect(summary).toContainEqual(["Açılan iş emri", 6])
      expect(summary).toContainEqual(["SLA uyumu", "%50"])
      const orders = XLSX.utils.sheet_to_json(book.Sheets["İş emirleri"]!)
      expect(orders).toHaveLength(6)

      const archive = await http.get(
        "/portal/reports",
        z.object({
          items: z.array(z.object({ month: z.string(), partial: z.boolean() })),
        })
      )
      expect(archive.items[0]).toEqual({ month: "2026-10", partial: true })
      const summaryCard = await http.get("/portal/summary", portalSummarySchema)
      expect(summaryCard.openWorkOrders).toBe(1)
    })

    it("TC-4.5-03 customer_user talep açar ve raporları görür; gönderim ayarı ve onay yetkisi yok", async () => {
      mockClock.freeze(OCTOBER)
      applyTestScenario("quality-demo")
      signIn(TENANT, "musteri-kullanici")
      const customerId = portalReportCustomerId(TENANT)!
      const location = db.locations.findFirst(
        (item) => item.customerId === customerId && item.status === "active"
      )!
      const options = await http.get("/portal/request-options", any)
      expect(JSON.stringify(options)).toContain(location.id)
      const receipt = await http.post(
        "/portal/requests",
        requestReceiptSchema,
        {
          body: {
            locationId: location.id,
            areaId: null,
            categoryCode: "other",
            note: "Lobi kapısı",
          },
        }
      )
      const order = db.workOrders.findById(receipt.workOrderId)!
      expect(order).toMatchObject({
        source: "customer_request",
        requestedBy: `u-${TENANT}-musteri-kullanici`,
      })
      expect(order.history[0]!.actorName).toBe("Derya Kılıç (Portal)")
      await http.get("/portal/report-subscription", reportSubscriptionSchema)
      const settings = await failure(
        http.put("/portal/report-subscription", any, {
          body: {
            recipients: ["a@b.com"],
            frequency: "monthly",
            includeSections: ["sla"],
          },
        })
      )
      expect(settings.status).toBe(403)
      expect(
        (await failure(http.get("/portal/progress-payments", any))).status
      ).toBe(403)
      // İş emri yönetemez
      expect(
        (
          await failure(
            http.post(`/work-orders/${order.id}/transition`, any, {
              body: { action: "cancel", note: "İptal ediyorum" },
            })
          )
        ).status
      ).toBe(403)

      signIn(TENANT, "musteri")
      const saved = await http.put(
        "/portal/report-subscription",
        reportSubscriptionSchema,
        {
          body: {
            recipients: ["idari@ornek.com"],
            frequency: "weekly",
            includeSections: ["sla", "audits"],
          },
        }
      )
      expect(saved).toMatchObject({
        frequency: "weekly",
        updatedBy: "Kerem Öztürk",
      })
      const invalid = await failure(
        http.put("/portal/report-subscription", any, {
          body: {
            recipients: ["gecersiz"],
            frequency: "weekly",
            includeSections: ["sla"],
          },
        })
      )
      expect(invalid.status).toBe(422)
    })

    it("TC-4.5-04 portal puantaj onayları müşteri kapsamında (başka müşterinin dönemi görünmez)", async () => {
      mockClock.freeze("2026-10-02T10:00:00+03:00")
      const customerA = portalReportCustomerId(TENANT)!
      const location = db.locations.findFirst(
        (item) => item.customerId === customerA
      )!
      addStaffingContract(TENANT, "le-temizlik-orta-1", [location.id])
      const id = "tsp-le-temizlik-orta-1-2026-09"
      signIn(TENANT, "bolge")
      await http.get(`/timesheet/periods/${id}`, any)
      db.timesheetPeriods.update(id, {
        status: "region_approved",
        customerApprovalRequired: true,
      })
      signIn(TENANT, "musteri")
      const own = await http.get(
        "/portal/timesheet-approvals",
        timesheetPeriodListSchema
      )
      expect(own.items.map((item) => item.id)).toContain(id)
      signIn(TENANT, "musteri-b")
      // Faz 2'de musteri-b yoktu; aynı yetkiye sahip olsa da başka müşterinin dönemi görünmez
      const other = await http.get(
        "/portal/timesheet-approvals",
        timesheetPeriodListSchema
      )
      expect(other.items.map((item) => item.id)).not.toContain(id)
      const approve = await failure(
        http.post(`/timesheet/periods/${id}/transition`, any, {
          body: { action: "approve_customer" },
        })
      )
      expect(approve.status).toBe(404)
    })
  })
})
