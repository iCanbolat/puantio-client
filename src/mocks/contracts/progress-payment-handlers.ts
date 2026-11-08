import { http } from "msw"
import { z } from "zod"
import * as XLSX from "xlsx"

import {
  diffCalculations,
  sourceFingerprint,
} from "@/features/progress-payment/domain/calculate"
import {
  availablePaymentActions,
  isPaymentEditable,
  nextPaymentStatus,
} from "@/features/progress-payment/domain/status"
import {
  LINE_KIND_LABELS,
  PROGRESS_PAYMENT_ACTION_LABELS,
  createProgressPaymentSchema,
  manualPenaltySchema,
  progressPaymentListParamsSchema,
  transitionInputSchema,
  type ProgressPayment,
  type ProgressPaymentSummary,
} from "@/features/progress-payment/model/progress-payment"
import { includesTr } from "@/shared/lib/format"
import { addMonths, monthOf, monthRange } from "@/shared/lib/work-time"

import { audit, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockContract, MockProgressPayment } from "../db/types"
import {
  apiPath,
  created,
  fileResponse,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import { paginate } from "../operations/common"
import { ops } from "../operations/store"
import { ensurePeriods, periodId } from "../operations/timesheet"
import { findContract, visibleContracts } from "./contract-handlers"
import { calculate, contractLocationIds, workedSource } from "./contracts"
import { collectPersonDays } from "./worked"

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`))

/** Kaynak puantaj dönemi (yüklenici tüzel kişilik) İK onaylı veya kilitli mi */
export function timesheetApproved(
  auth: AuthContext,
  contract: MockContract,
  month: string
): boolean {
  ensurePeriods(auth.tenant, mockClock.now())
  const period = db.timesheetPeriods.findById(
    periodId(contract.contractorLegalEntityId, month)
  )
  if (!period) return month < addMonths(monthOf(mockClock.now()), -2)
  return period.status === "hr_approved" || period.status === "locked"
}

function isStale(payment: MockProgressPayment, contract: MockContract) {
  if (!isPaymentEditable(payment.status)) return false
  return (
    sourceFingerprint(
      workedSource(contract, payment.month, mockClock.now())
    ) !== payment.fingerprint
  )
}

function summary(
  payment: MockProgressPayment,
  contract: MockContract
): ProgressPaymentSummary {
  const calculation = calculate(
    contract,
    payment.month,
    payment.source,
    payment.penalties
  )
  return {
    id: payment.id as ProgressPaymentSummary["id"],
    number: payment.number,
    contractId: contract.id,
    contractCode: contract.code,
    contractTitle: contract.title,
    contractType: contract.type,
    customerName: db.customers.findById(contract.customerId)?.name ?? "—",
    month: payment.month,
    status: payment.status,
    total: calculation.totals.total,
    isStale: isStale(payment, contract),
    updatedAt: payment.updatedAt,
  }
}

function serialize(
  auth: AuthContext,
  payment: MockProgressPayment,
  contract: MockContract
): ProgressPayment {
  const approved = timesheetApproved(auth, contract, payment.month)
  return {
    ...summary(payment, contract),
    calculation: calculate(
      contract,
      payment.month,
      payment.source,
      payment.penalties
    ),
    penalties: payment.penalties,
    timesheetApproved: approved,
    invoiceNumber: payment.invoiceNumber,
    calculatedAt: payment.calculatedAt,
    history: payment.history,
    availableActions: availablePaymentActions(
      payment.status,
      auth.permissions,
      approved
    ),
  }
}

function visiblePayments(auth: AuthContext) {
  ensureSamplePayments(auth)
  const contracts = new Map(
    visibleContracts(auth).map((contract) => [contract.id, contract])
  )
  return db.progressPayments
    .findMany(
      (payment) =>
        payment.tenantId === auth.tenant.slug &&
        contracts.has(payment.contractId)
    )
    .map((payment) => ({
      payment,
      contract: contracts.get(payment.contractId)!,
    }))
}

function findPayment(auth: AuthContext, id: string) {
  return visiblePayments(auth).find((item) => item.payment.id === id) ?? null
}

/** Kiracının ilk sözleşmesi için iki ay önceye ait faturalanmış örnek hakediş */
function ensureSamplePayments(auth: AuthContext): void {
  const tenantId = auth.tenant.slug
  if (ops.paymentsSeeded.has(tenantId)) return
  ops.paymentsSeeded.add(tenantId)
  const contract = db.contracts.findFirst(
    (item) => item.tenantId === tenantId && item.startDate <= "2026-01-01"
  )
  if (!contract) return
  const month = addMonths(monthOf(mockClock.now()), -2)
  if (
    month < contract.startDate.slice(0, 7) ||
    month > contract.endDate.slice(0, 7)
  )
    return
  const source = workedSource(contract, month, mockClock.now())
  const at = `${monthRange(addMonths(month, 1)).from}T11:00:00+03:00`
  db.progressPayments.insert({
    id: `pp-${tenantId}-sample`,
    tenantId,
    number: `HK-${month.replace("-", "")}-001`,
    contractId: contract.id,
    month,
    status: "invoiced",
    penalties: [],
    source,
    fingerprint: sourceFingerprint(source),
    calculatedAt: at,
    invoiceNumber: `PNT${month.replace("-", "")}0001`,
    history: [
      { at, actor: "Finans", action: "Taslak oluşturuldu", note: null },
      { at, actor: "Finans", action: "Faturalandı", note: null },
    ],
    updatedAt: at,
  })
  if (ops.flags.stalePaymentTenants.has(tenantId)) seedStaleDraft(auth)
}

/**
 * stale-progress-payment: geçen ayın taslağı hesaplanır, ardından bir personelin çalıştığı
 * bir gün puantajda "Devamsız" olarak düzeltilir (taslak güncel değil olur).
 */
function seedStaleDraft(auth: AuthContext): void {
  const tenantId = auth.tenant.slug
  const contract = db.contracts.findById(`ct-${tenantId}-1`)
  if (!contract) return
  const month = addMonths(monthOf(mockClock.now()), -1)
  const now = mockClock.now()
  const source = workedSource(contract, month, now)
  const at = now.toISOString()
  db.progressPayments.insert({
    id: `pp-${tenantId}-stale`,
    tenantId,
    number: `HK-${month.replace("-", "")}-002`,
    contractId: contract.id,
    month,
    status: "draft",
    penalties: [],
    source,
    fingerprint: sourceFingerprint(source),
    calculatedAt: at,
    invoiceNumber: null,
    history: [
      { at, actor: "Finans", action: "Taslak oluşturuldu", note: null },
    ],
    updatedAt: at,
  })
  const day = collectPersonDays(
    tenantId,
    monthRange(month),
    contractLocationIds(contract, month),
    now
  ).find((item) => item.worked === 1)
  const person = day ? db.personnel.findById(day.personnelId) : undefined
  if (!day || !person) return
  const period = periodId(person.legalEntityId, month)
  db.timesheetOverrides.insert({
    id: `${period}|${person.id}|${day.date}`,
    tenantId,
    periodId: period,
    personnelId: person.id,
    date: day.date,
    code: "D",
    overtimeHours: 0,
    by: "Bölge sorumlusu",
    at,
  })
}

const PENALTIES_SCHEMA = z.object({
  penalties: z.array(manualPenaltySchema).max(20),
})

function buildWorkbook(payment: ProgressPayment): Uint8Array<ArrayBuffer> {
  const calc = payment.calculation
  const tl = (value: number) => value / 100
  const sheet = XLSX.utils.aoa_to_sheet([
    [`Hakediş ${payment.number}`],
    [`${payment.contractCode} ${payment.contractTitle}`],
    [`Müşteri: ${payment.customerName}`, `Dönem: ${monthLabel(payment.month)}`],
    [],
    ["Kalem", "Açıklama", "Miktar", "Birim", "Birim fiyat (TL)", "Tutar (TL)"],
    ...calc.lines.map((line) => [
      LINE_KIND_LABELS[line.kind],
      line.label,
      line.quantity,
      line.unit,
      line.unitPrice === null ? "" : tl(line.unitPrice),
      tl(line.amount),
    ]),
    [],
    ["", "Ara toplam", "", "", "", tl(calc.totals.subtotal)],
    ["", `KDV (%${calc.totals.vatRate})`, "", "", "", tl(calc.totals.vat)],
    ["", "Genel toplam", "", "", "", tl(calc.totals.total)],
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Hakediş")
  return new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer
  )
}

export const progressPaymentHandlers = [
  http.get(
    apiPath("/progress-payments"),
    withAuth("progress_payment:read", ({ request, auth }) => {
      const params = parseQuery(request, progressPaymentListParamsSchema)
      const items = visiblePayments(auth)
        .filter(
          ({ payment, contract }) =>
            (!params.status || payment.status === params.status) &&
            (!params.contractId || payment.contractId === params.contractId) &&
            (!params.month || payment.month === params.month) &&
            (!params.q ||
              includesTr(
                `${payment.number} ${contract.code} ${contract.title}`,
                params.q
              ))
        )
        .sort(
          (a, b) =>
            b.payment.month.localeCompare(a.payment.month) ||
            a.payment.number.localeCompare(b.payment.number)
        )
        .map(({ payment, contract }) => summary(payment, contract))
      return ok(paginate(items, params.page, params.pageSize))
    })
  ),
  http.post(
    apiPath("/progress-payments"),
    withAuth("progress_payment:approve", async ({ request, auth }) => {
      const parsed = await parseBody(request, createProgressPaymentSchema)
      if (!parsed.success) return parsed.response
      const { contractId, month } = parsed.data
      const contract = findContract(auth, contractId)
      if (!contract)
        return problem(422, "VALIDATION", "Sözleşme bulunamadı.", {
          contractId: ["Sözleşme bulunamadı"],
        })
      const range = monthRange(month)
      if (range.to < contract.startDate || range.from > contract.endDate)
        return problem(422, "VALIDATION", "Dönem sözleşme süresi dışında.", {
          month: ["Dönem sözleşme süresi dışında"],
        })
      if (month > monthOf(mockClock.now()))
        return problem(
          422,
          "VALIDATION",
          "Gelecek dönem için hakediş açılamaz.",
          {
            month: ["Gelecek dönem için hakediş açılamaz"],
          }
        )
      ensureSamplePayments(auth)
      const existing = db.progressPayments.findFirst(
        (payment) =>
          payment.contractId === contractId && payment.month === month
      )
      if (existing)
        return problem(
          409,
          "PAYMENT_EXISTS",
          `Bu dönem için hakediş zaten var (${existing.number}).`
        )
      const source = workedSource(contract, month, mockClock.now())
      const now = mockClock.now().toISOString()
      const sequence =
        db.progressPayments.count((p) => p.tenantId === auth.tenant.slug) + 1
      const payment = db.progressPayments.insert({
        id: newId(`pp-${auth.tenant.slug}`),
        tenantId: auth.tenant.slug,
        number: `HK-${month.replace("-", "")}-${String(sequence).padStart(3, "0")}`,
        contractId,
        month,
        status: "draft",
        penalties: [],
        source,
        fingerprint: sourceFingerprint(source),
        calculatedAt: now,
        invoiceNumber: null,
        history: [
          {
            at: now,
            actor: auth.actorName,
            action: "Taslak oluşturuldu",
            note: null,
          },
        ],
        updatedAt: now,
      })
      audit(auth, {
        action: "Hakediş taslağı oluşturuldu",
        targetType: "progress_payment",
        targetLabel: `${payment.number} · ${contract.code}`,
      })
      return created(serialize(auth, payment, contract))
    })
  ),
  http.get(
    apiPath("/progress-payments/:paymentId"),
    withAuth("progress_payment:read", ({ params, auth }) => {
      const found = findPayment(auth, String(params.paymentId))
      return found
        ? ok(serialize(auth, found.payment, found.contract))
        : notFound()
    })
  ),
  http.get(
    apiPath("/progress-payments/:paymentId/recalculation"),
    withAuth("progress_payment:read", ({ params, auth }) => {
      const found = findPayment(auth, String(params.paymentId))
      if (!found) return notFound()
      const { payment, contract } = found
      const current = calculate(
        contract,
        payment.month,
        payment.source,
        payment.penalties
      )
      const next = calculate(
        contract,
        payment.month,
        workedSource(contract, payment.month, mockClock.now()),
        payment.penalties
      )
      return ok({ current, next, changes: diffCalculations(current, next) })
    })
  ),
  http.post(
    apiPath("/progress-payments/:paymentId/recalculate"),
    withAuth("progress_payment:approve", ({ params, auth }) => {
      const found = findPayment(auth, String(params.paymentId))
      if (!found) return notFound()
      const { payment, contract } = found
      if (!isPaymentEditable(payment.status))
        return problem(
          409,
          "PAYMENT_LOCKED",
          "Onaylanan hakediş yeniden hesaplanamaz."
        )
      const source = workedSource(contract, payment.month, mockClock.now())
      const before = calculate(
        contract,
        payment.month,
        payment.source,
        payment.penalties
      )
      const now = mockClock.now().toISOString()
      const updated = db.progressPayments.update(payment.id, {
        source,
        fingerprint: sourceFingerprint(source),
        calculatedAt: now,
        updatedAt: now,
        history: [
          ...payment.history,
          {
            at: now,
            actor: auth.actorName,
            action: "Güncel puantajla yeniden hesaplandı",
            note: null,
          },
        ],
      })!
      const after = calculate(
        contract,
        payment.month,
        source,
        payment.penalties
      )
      audit(auth, {
        action: "Hakediş yeniden hesaplandı",
        targetType: "progress_payment",
        targetLabel: payment.number,
        details: `Toplam: ${before.totals.total / 100} → ${after.totals.total / 100} TL`,
      })
      return ok(serialize(auth, updated, contract))
    })
  ),
  http.put(
    apiPath("/progress-payments/:paymentId/penalties"),
    withAuth("progress_payment:approve", async ({ request, params, auth }) => {
      const found = findPayment(auth, String(params.paymentId))
      if (!found) return notFound()
      if (!isPaymentEditable(found.payment.status))
        return problem(
          409,
          "PAYMENT_LOCKED",
          "Onaylanan hakediş değiştirilemez."
        )
      const parsed = await parseBody(request, PENALTIES_SCHEMA)
      if (!parsed.success) return parsed.response
      const now = mockClock.now().toISOString()
      const updated = db.progressPayments.update(found.payment.id, {
        penalties: parsed.data.penalties,
        updatedAt: now,
        history: [
          ...found.payment.history,
          {
            at: now,
            actor: auth.actorName,
            action: "Ceza kalemleri güncellendi",
            note: `${parsed.data.penalties.length} kalem`,
          },
        ],
      })!
      return ok(serialize(auth, updated, found.contract))
    })
  ),
  http.post(
    apiPath("/progress-payments/:paymentId/transition"),
    withAuth(null, async ({ request, params, auth }) => {
      if (
        !auth.permissions.has("progress_payment:read") &&
        !auth.permissions.has("progress_payment:approve_customer")
      )
        return problem(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.")
      const found = findPayment(auth, String(params.paymentId))
      if (!found) return notFound()
      const parsed = await parseBody(request, transitionInputSchema)
      if (!parsed.success) return parsed.response
      const { action, note, invoiceNumber } = parsed.data
      const { payment, contract } = found
      const allowedByRole =
        action === "approve_customer"
          ? auth.permissions.has("progress_payment:approve") ||
            auth.permissions.has("progress_payment:approve_customer")
          : auth.permissions.has("progress_payment:approve")
      if (!allowedByRole)
        return problem(403, "FORBIDDEN", "Hakediş onay yetkiniz yok.")
      const next = nextPaymentStatus(payment.status, action)
      if (!next)
        return problem(
          409,
          "INVALID_TRANSITION",
          "Hakediş bu aşamada bu işleme uygun değil."
        )
      if (
        action === "submit" &&
        !timesheetApproved(auth, contract, payment.month)
      )
        return problem(
          409,
          "TIMESHEET_NOT_APPROVED",
          "Dönemin puantajı İK onayı almadan hakediş kontrole gönderilemez."
        )
      if (action === "submit" && isStale(payment, contract))
        return problem(
          409,
          "PAYMENT_STALE",
          "Puantaj değişti; önce hakedişi yeniden hesaplayın."
        )
      const onBehalf =
        action === "approve_customer" &&
        !auth.permissions.has("progress_payment:approve_customer")
      if (onBehalf && !note?.trim())
        return problem(
          422,
          "VALIDATION",
          "Müşteri adına onay için gerekçe girin.",
          {
            note: ["Gerekçe zorunlu"],
          }
        )
      if (action === "invoice" && !invoiceNumber?.trim())
        return problem(422, "VALIDATION", "Fatura numarasını girin.", {
          invoiceNumber: ["Fatura numarasını girin"],
        })
      const now = mockClock.now().toISOString()
      const updated = db.progressPayments.update(payment.id, {
        status: next,
        invoiceNumber:
          action === "invoice" ? invoiceNumber!.trim() : payment.invoiceNumber,
        updatedAt: now,
        history: [
          ...payment.history,
          {
            at: now,
            actor: auth.actorName,
            action: PROGRESS_PAYMENT_ACTION_LABELS[action],
            note:
              note?.trim() ||
              (action === "invoice" ? invoiceNumber!.trim() : null),
          },
        ],
      })!
      audit(auth, {
        action: `Hakediş: ${PROGRESS_PAYMENT_ACTION_LABELS[action]}`,
        targetType: "progress_payment",
        targetLabel: payment.number,
        details: note?.trim() || null,
      })
      return ok(serialize(auth, updated, contract))
    })
  ),
  http.get(
    apiPath("/progress-payments/:paymentId/export"),
    withAuth("progress_payment:read", ({ params, auth }) => {
      const found = findPayment(auth, String(params.paymentId))
      if (!found) return notFound()
      const payment = serialize(auth, found.payment, found.contract)
      return fileResponse(
        buildWorkbook(payment),
        `hakedis-${payment.number}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    })
  ),
  http.get(
    apiPath("/portal/progress-payments"),
    withAuth("progress_payment:approve_customer", ({ auth }) =>
      ok({
        items: visiblePayments(auth)
          .filter(({ payment }) =>
            ["customer_approval", "approved", "invoiced"].includes(
              payment.status
            )
          )
          .map(({ payment, contract }) => serialize(auth, payment, contract)),
      })
    )
  ),
]
