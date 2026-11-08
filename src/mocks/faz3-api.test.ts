import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { z } from "zod"

import { formatHeadcountGap, headcountGap } from "@/features/contracts"
import {
  contractSchema,
  headcountLocationDetailSchema,
  headcountReportSchema,
  type VersionBody,
} from "@/features/contracts/model/contract"
import {
  progressPaymentListSchema,
  progressPaymentSchema,
  recalculationPreviewSchema,
} from "@/features/progress-payment/model/progress-payment"
import { timesheetPeriodListSchema } from "@/features/timesheet/model/timesheet"
import { contractListSchema } from "@/entities/contract"
import { applyTestScenario } from "@/test/scenario"
import { ApiError } from "@/shared/api/errors"
import { configureHttp, http } from "@/shared/api/http"
import { kurus } from "@/shared/lib/money"

import { identityFor } from "./auth/identities"
import { mintMockToken } from "./auth/token"
import { mockClock } from "./clock"
import { db } from "./db"
import {
  buildAssignment,
  ensureRange,
  tenantTemplates,
} from "./operations/plan"
import { addAssignment, ops } from "./operations/store"
import { periodId } from "./operations/timesheet"
import { shortfallContractId } from "./scenarios/phase3"

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

const TENANT = "temizlik-orta"
const KADRO = shortfallContractId(TENANT)
const FIRST = `ct-${TENANT}-1`
const OCTOBER = "2026-10-05T10:00:00+03:00"

function override(personnelId: string, date: string, code = "D") {
  const person = db.personnel.findById(personnelId)!
  const period = periodId(person.legalEntityId, date.slice(0, 7))
  db.timesheetOverrides.insert({
    id: `${period}|${personnelId}|${date}`,
    tenantId: person.tenantId,
    periodId: period,
    personnelId,
    date,
    code,
    overtimeHours: 0,
    by: "Test",
    at: OCTOBER,
  })
}

function sampleBody(locationIds: string[], headcount = 2): VersionBody {
  return {
    serviceLines: ["cleaning"],
    scopeItems: [{ serviceLine: "cleaning", description: "Ofis temizliği" }],
    locations: locationIds.map((locationId) => ({
      locationId,
      locationName: "",
      orgUnitName: "",
      from: "2026-01-01",
      to: null,
    })),
    commitments: locationIds.map((locationId) => ({
      locationId,
      position: "cleaning_staff",
      headcount,
      coverage: "six_days",
    })),
    prices: {
      unitPrices: [{ position: "cleaning_staff", monthly: kurus(4_000_000) }],
      overtimeHourly: kurus(30_000),
      materialMonthly: kurus(0),
    },
    rules: {
      shortfallDeductionPercent: 100,
      shortfallPenaltyPerPersonDay: kurus(0),
      vatRate: 20,
      priceAdjustment: {
        kind: "none",
        laborSharePercent: 100,
        ratePercent: null,
        effectiveFrom: null,
      },
      penalties: [],
    },
  }
}

describe("Faz 3 mock API: sözleşmeler", () => {
  it("seed: her kiracıda sözleşmeler; bölge sorumlusu yalnızca kapsamındakileri görür", async () => {
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const all = await http.get("/contracts", contractListSchema, {
      params: { pageSize: 100 },
    })
    expect(all.meta.total).toBeGreaterThan(2)
    expect(all.items.some((item) => item.status === "expired")).toBe(true)
    signIn(TENANT, "bolge")
    const regional = await http.get("/contracts", contractListSchema, {
      params: { pageSize: 100 },
    })
    expect(regional.meta.total).toBeLessThan(all.meta.total)
    signIn(TENANT, "ik")
    expect(
      (await failure(http.get("/contracts", contractListSchema))).status
    ).toBe(403)
  })

  it("TC-3.1-01 taahhüt kadro 0 → 422 alan hatası; geçerli sözleşme oluşturulur", async () => {
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const location = db.locations.findFirst((item) => item.tenantId === TENANT)!
    const general = {
      title: "Yeni temizlik sözleşmesi",
      customerId: location.customerId,
      contractorLegalEntityId: `le-${TENANT}-1`,
      type: "private",
      ikn: "",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      templateId: null,
    }
    const invalid = await failure(
      http.post("/contracts", contractSchema, {
        body: { general, body: sampleBody([location.id], 0) },
      })
    )
    expect(invalid.status).toBe(422)
    expect(invalid.fieldErrors?.["body.commitments.0.headcount"]).toEqual([
      "Taahhüt kadro en az 1 kişi olmalı",
    ])
    const publicWithoutIkn = await failure(
      http.post("/contracts", contractSchema, {
        body: {
          general: { ...general, type: "public_tender" },
          body: sampleBody([location.id]),
        },
      })
    )
    expect(publicWithoutIkn.fieldErrors?.["general.ikn"]).toEqual([
      "Kamu ihalesinde İKN zorunludur",
    ])
    const foreign = db.locations.findFirst(
      (item) =>
        item.tenantId === TENANT && item.customerId !== location.customerId
    )!
    const wrongCustomer = await failure(
      http.post("/contracts", contractSchema, {
        body: { general, body: sampleBody([location.id, foreign.id]) },
      })
    )
    expect(wrongCustomer.fieldErrors?.["body.locations.1.locationId"]).toEqual([
      "Lokasyon bu müşteriye ait değil",
    ])
    const contract = await http.post("/contracts", contractSchema, {
      body: { general, body: sampleBody([location.id]) },
    })
    expect(contract).toMatchObject({
      status: "active",
      versionCount: 1,
      committedHeadcount: 2,
    })
    expect(contract.versions[0]?.locations[0]?.locationName).toBe(location.name)
  })

  it("TC-3.1-02 çakışan yürürlük tarihli zeyilname 409; geçerli zeyilname önceki sürümü kapatır", async () => {
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const contract = await http.get(`/contracts/${FIRST}`, contractSchema)
    const last = contract.versions.at(-1)!
    const body = { ...last, prices: { ...last.prices } } satisfies VersionBody
    const overlap = await failure(
      http.post(`/contracts/${FIRST}/versions`, contractSchema, {
        body: { effectiveFrom: last.effectiveFrom, note: "Çakışan", body },
      })
    )
    expect(overlap).toMatchObject({ status: 409, code: "VERSION_OVERLAP" })
    const updated = await http.post(
      `/contracts/${FIRST}/versions`,
      contractSchema,
      {
        body: { effectiveFrom: "2026-11-01", note: "Kasım revizyonu", body },
      }
    )
    expect(updated.versionCount).toBe(contract.versionCount + 1)
    expect(updated.versions.at(-2)?.effectiveTo).toBe("2026-10-31")
    expect(updated.versions.at(-1)).toMatchObject({
      number: last.number + 1,
      effectiveFrom: "2026-11-01",
      effectiveTo: "2026-12-31",
    })
  })

  it("TC-3.1-05 personel temini sözleşmesi puantaj dönemine müşteri onayı adımı ekler", async () => {
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "ik")
    const before = await http.get(
      "/timesheet/periods",
      timesheetPeriodListSchema
    )
    expect(before.items.every((item) => !item.customerApprovalRequired)).toBe(
      true
    )
    db.timesheetPeriods.clear()
    signIn(TENANT, "finans")
    const location = db.locations.findFirst((item) => item.tenantId === TENANT)!
    await http.post("/contracts", contractSchema, {
      body: {
        general: {
          title: "Personel temini",
          customerId: location.customerId,
          contractorLegalEntityId: `le-${TENANT}-1`,
          type: "staffing",
          ikn: "",
          startDate: "2026-10-01",
          endDate: "2027-09-30",
          templateId: null,
        },
        body: {
          ...sampleBody([location.id]),
          locations: [
            {
              locationId: location.id,
              locationName: "",
              orgUnitName: "",
              from: "2026-10-01",
              to: null,
            },
          ],
        },
      },
    })
    signIn(TENANT, "ik")
    const after = await http.get(
      "/timesheet/periods",
      timesheetPeriodListSchema
    )
    const flags = after.items
      .filter((item) => item.legalEntityId === `le-${TENANT}-1`)
      .map((item) => [item.month, item.customerApprovalRequired])
    expect(flags).toEqual(
      expect.arrayContaining([
        ["2026-10", true],
        ["2026-09", false],
      ])
    )
  })
})

describe("Faz 3 mock API: kadro raporu", () => {
  it("TC-3.2-01 headcount-shortfall: taahhüt 120, fiili 112 → −8 (%6,7)", async () => {
    applyTestScenario("headcount-shortfall")
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const report = await http.get(
      "/contracts/headcount",
      headcountReportSchema,
      {
        params: { contractId: KADRO, month: "2026-09" },
      }
    )
    expect(report.totals).toEqual({ committed: 120, actual: 112 })
    expect(formatHeadcountGap(headcountGap(120, report.totals.actual))).toBe(
      "120 / 112, −8 (%6,7)"
    )
    expect(report.regions).toHaveLength(1)
    expect(report.regions[0]).toMatchObject({ committed: 120, actual: 112 })
    expect(report.rows.map((row) => [row.committed, row.actual])).toEqual([
      [50, 46],
      [40, 38],
      [30, 28],
    ])
    expect(report.rows[0]?.plannedDays).toBe(26)

    signIn(TENANT, "bolge")
    const regional = await http.get(
      "/contracts/headcount",
      headcountReportSchema,
      {
        params: { contractId: KADRO, month: "2026-09" },
      }
    )
    expect(regional.totals.committed).toBe(120)

    const file = await http.getBlob("/contracts/headcount/export", {
      params: { contractId: KADRO, month: "2026-09" },
    })
    expect(file.filename).toBe("kadro-raporu-2026-09.xlsx")
    const sheet = XLSX.read(await file.blob.arrayBuffer()).Sheets[
      "Kadro raporu"
    ]!
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    expect(rows[0]).toContain("Fiili kadro")
    expect(rows.at(-1)).toEqual(["Toplam", "", "", "", "", 120, 112, -8])
  })

  it("TC-3.2-02 lokasyona iniş: eksik günler personel bazında listelenir", async () => {
    applyTestScenario("headcount-shortfall")
    mockClock.freeze(OCTOBER)
    const locationId =
      db.contracts.findById(KADRO)!.versions[0]!.locations[0]!.locationId
    const person = db.personnel.findFirst(
      (item) => item.homeLocationId === locationId
    )!
    override(person.id, "2026-09-10", "D")
    override(person.id, "2026-09-11", "R")
    signIn(TENANT, "finans")
    const detail = await http.get(
      `/contracts/${KADRO}/headcount/locations/${locationId}`,
      headcountLocationDetailSchema,
      { params: { month: "2026-09" } }
    )
    expect(detail.plannedDates).toHaveLength(26)
    expect(detail.personnel).toHaveLength(46)
    expect(detail.personnel[0]).toMatchObject({
      personnelId: person.id,
      workedDays: 24,
      missing: [
        { date: "2026-09-10", code: "D" },
        { date: "2026-09-11", code: "R" },
      ],
    })
    expect(detail.personnel[1]?.missing).toEqual([])
    expect(detail.committed).toBe(50)
    expect(detail.actual).toBe(45.9)
  })

  it("TC-3.2-03 yedek personel atandığı lokasyonun kadrosuna sayılır", async () => {
    applyTestScenario("headcount-shortfall")
    mockClock.freeze(OCTOBER)
    const locationId =
      db.contracts.findById(KADRO)!.versions[0]!.locations[0]!.locationId
    const floater = db.personnel.findFirst(
      (item) => item.tenantId === TENANT && item.isFloater
    )!
    // Yalnızca taahhüt edilen pozisyondaki çalışma kadroya sayılır
    db.personnel.update(floater.id, { position: "cleaning_staff" })
    ensureRange(TENANT, "2026-09-01", "2026-09-30")
    const template = tenantTemplates(TENANT).get(`tpl-${TENANT}-sabah`)!
    const assignment = buildAssignment({
      id: "sh-yedek-test",
      tenantId: TENANT,
      personnelId: floater.id,
      locationId,
      date: "2026-09-10",
      template,
      kind: "backup",
    })
    addAssignment(assignment)
    const base = {
      tenantId: TENANT,
      shiftId: assignment.id,
      personnelId: floater.id,
      method: "qr" as const,
      offline: false,
      inside: true,
      distanceMeters: 5,
      hasPhoto: false,
      corrected: false,
    }
    ops.events.set(assignment.id, [
      {
        ...base,
        id: "ev-in",
        kind: "in",
        deviceTime: assignment.startsAt,
        receivedAt: assignment.startsAt,
      },
      {
        ...base,
        id: "ev-out",
        kind: "out",
        deviceTime: assignment.endsAt,
        receivedAt: assignment.endsAt,
      },
    ])
    signIn(TENANT, "finans")
    const detail = await http.get(
      `/contracts/${KADRO}/headcount/locations/${locationId}`,
      headcountLocationDetailSchema,
      { params: { month: "2026-09" } }
    )
    const backup = detail.personnel.find(
      (item) => item.personnelId === floater.id
    )
    expect(backup?.workedDays).toBe(1)
    const report = await http.get(
      "/contracts/headcount",
      headcountReportSchema,
      {
        params: { contractId: KADRO, month: "2026-09" },
      }
    )
    expect(report.rows[0]?.workedPersonDays).toBe(46 * 26 + 1)
  })
})

describe("Faz 3 mock API: hakediş", () => {
  it("TC-3.3-02 ayın 15'inde fiyat değişikliği: işçilik iki sürüm diliminde kıst", async () => {
    applyTestScenario("price-change-mid-month")
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const payment = await http.post(
      "/progress-payments",
      progressPaymentSchema,
      {
        body: { contractId: FIRST, month: "2026-09" },
      }
    )
    expect(payment.status).toBe("draft")
    const labor = payment.calculation.lines.filter(
      (line) => line.kind === "labor"
    )
    const versions = [...new Set(labor.map((line) => line.versionNumber))]
    expect(versions).toHaveLength(2)
    expect(
      [...new Set(labor.map((line) => `${line.from}–${line.to}`))].sort()
    ).toEqual(["2026-09-01–2026-09-14", "2026-09-15–2026-09-30"])
    const duplicate = await failure(
      http.post("/progress-payments", progressPaymentSchema, {
        body: { contractId: FIRST, month: "2026-09" },
      })
    )
    expect(duplicate).toMatchObject({ status: 409, code: "PAYMENT_EXISTS" })
  })

  it("TC-3.3-04 bölge sorumlusu hakedişi görür ama onaylayamaz (buton yok / 403)", async () => {
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const payment = await http.post(
      "/progress-payments",
      progressPaymentSchema,
      {
        body: { contractId: FIRST, month: "2026-07" },
      }
    )
    expect(payment.availableActions).toEqual(["submit"])
    signIn(TENANT, "bolge")
    const regional = await http
      .get(`/progress-payments/${payment.id}`, progressPaymentSchema)
      .catch(() => null)
    if (regional) expect(regional.availableActions).toEqual([])
    const denied = await failure(
      http.post(
        `/progress-payments/${payment.id}/transition`,
        progressPaymentSchema,
        {
          body: { action: "submit" },
        }
      )
    )
    expect([403, 404]).toContain(denied.status)
    signIn(TENANT, "ik")
    expect(
      (await failure(http.get("/progress-payments", progressPaymentListSchema)))
        .status
    ).toBe(403)
  })

  it("TC-3.3-05 taslak sonrası puantaj değişikliği: güncel değil + fark; yeniden hesap", async () => {
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const payment = await http.post(
      "/progress-payments",
      progressPaymentSchema,
      {
        body: { contractId: FIRST, month: "2026-07" },
      }
    )
    expect(payment.isStale).toBe(false)
    const contract = db.contracts.findById(FIRST)!
    const locationIds = new Set(
      contract.versions.flatMap((v) => v.locations.map((l) => l.locationId))
    )
    const person = db.personnel.findFirst(
      (item) =>
        item.homeLocationId !== null && locationIds.has(item.homeLocationId)
    )!
    override(person.id, "2026-07-07", "D")
    const stale = await http.get(
      `/progress-payments/${payment.id}`,
      progressPaymentSchema
    )
    expect(stale.isStale).toBe(true)
    const blocked = await failure(
      http.post(
        `/progress-payments/${payment.id}/transition`,
        progressPaymentSchema,
        {
          body: { action: "submit" },
        }
      )
    )
    expect(blocked.code).toBe("PAYMENT_STALE")
    const preview = await http.get(
      `/progress-payments/${payment.id}/recalculation`,
      recalculationPreviewSchema
    )
    expect(preview.changes.at(-1)?.key).toBe("total")
    expect(preview.changes.at(-1)!.difference).toBeLessThan(0)
    const recalculated = await http.post(
      `/progress-payments/${payment.id}/recalculate`,
      progressPaymentSchema
    )
    expect(recalculated.isStale).toBe(false)
    expect(recalculated.total).toBe(preview.next.totals.total)
  })

  it("TC-3.3-07 akış: kontrol → müşteri onayı → faturalandı; onaydan sonra kilitli (409)", async () => {
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const draft = await http.post("/progress-payments", progressPaymentSchema, {
      body: { contractId: FIRST, month: "2026-07" },
    })
    const step = (action: string, extra: object = {}) =>
      http.post(
        `/progress-payments/${draft.id}/transition`,
        progressPaymentSchema,
        {
          body: { action, ...extra },
        }
      )
    await http.put(
      `/progress-payments/${draft.id}/penalties`,
      progressPaymentSchema,
      {
        body: {
          penalties: [
            {
              code: "SLA",
              label: "SLA ihlali",
              kind: "percent",
              amount: 1,
              quantity: 1,
              note: null,
            },
          ],
        },
      }
    )
    expect((await step("submit")).status).toBe("review")
    expect((await step("send_to_customer")).status).toBe("customer_approval")
    const noReason = await failure(step("approve_customer"))
    expect(noReason.fieldErrors?.note).toEqual(["Gerekçe zorunlu"])
    const approved = await step("approve_customer", {
      note: "Müşteri e-postayla onayladı",
    })
    expect(approved.status).toBe("approved")
    expect(approved.calculation.totals.penalties).toBeLessThan(0)
    expect(
      (await failure(step("invoice"))).fieldErrors?.invoiceNumber
    ).toBeDefined()
    const invoiced = await step("invoice", { invoiceNumber: "PNT2026000123" })
    expect(invoiced).toMatchObject({
      status: "invoiced",
      invoiceNumber: "PNT2026000123",
      availableActions: [],
    })
    expect(invoiced.history.map((entry) => entry.action)).toContain(
      "Müşteri adına onayla"
    )
    const locked = await failure(
      http.post(
        `/progress-payments/${draft.id}/recalculate`,
        progressPaymentSchema
      )
    )
    expect(locked).toMatchObject({ status: 409, code: "PAYMENT_LOCKED" })
    const file = await http.getBlob(`/progress-payments/${draft.id}/export`)
    const sheet = XLSX.read(await file.blob.arrayBuffer()).Sheets["Hakediş"]!
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    expect(rows[0]).toEqual([`Hakediş ${draft.number}`])
    expect(rows.at(-1)).toEqual([
      "",
      "Genel toplam",
      "",
      "",
      "",
      invoiced.calculation.totals.total / 100,
    ])
  })

  it("kaynak puantaj onaysızsa kontrole gönderilemez; müşteri portalı kendi hakedişini onaylar", async () => {
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const september = await http.post(
      "/progress-payments",
      progressPaymentSchema,
      {
        body: { contractId: FIRST, month: "2026-09" },
      }
    )
    expect(september.timesheetApproved).toBe(false)
    expect(september.availableActions).toEqual([])
    const blocked = await failure(
      http.post(
        `/progress-payments/${september.id}/transition`,
        progressPaymentSchema,
        {
          body: { action: "submit" },
        }
      )
    )
    expect(blocked.code).toBe("TIMESHEET_NOT_APPROVED")

    const customerId = (
      db.users.findById(`u-${TENANT}-musteri`)!.scope as { ids: string[] }
    ).ids[0]!
    const own = db.contracts.findFirst(
      (item) =>
        item.tenantId === TENANT &&
        item.customerId === customerId &&
        item.startDate === "2026-01-01"
    )
    if (!own) return
    const draft = await http.post("/progress-payments", progressPaymentSchema, {
      body: { contractId: own.id, month: "2026-07" },
    })
    for (const action of ["submit", "send_to_customer"])
      await http.post(
        `/progress-payments/${draft.id}/transition`,
        progressPaymentSchema,
        {
          body: { action },
        }
      )
    signIn(TENANT, "musteri")
    const portal = await http.get(
      "/portal/progress-payments",
      z.object({ items: z.array(progressPaymentSchema) })
    )
    const pending = portal.items.filter(
      (item) => item.status === "customer_approval"
    )
    expect(pending.map((item) => item.id)).toEqual([draft.id])
    expect(pending[0]?.availableActions).toEqual(["approve_customer"])
    const approved = await http.post(
      `/progress-payments/${draft.id}/transition`,
      progressPaymentSchema,
      { body: { action: "approve_customer" } }
    )
    expect(approved.status).toBe("approved")
  })

  it("stale-progress-payment senaryosu: geçen ayın taslağı güncel değil", async () => {
    applyTestScenario("stale-progress-payment")
    mockClock.freeze(OCTOBER)
    signIn(TENANT, "finans")
    const list = await http.get("/progress-payments", progressPaymentListSchema)
    const stale = list.items.find((item) => item.status === "draft")
    expect(stale).toMatchObject({ month: "2026-09", isStale: true })
    expect(list.items.some((item) => item.status === "invoiced")).toBe(true)
  })
})
