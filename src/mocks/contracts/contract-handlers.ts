import { http } from "msw"
import { z } from "zod"
import * as XLSX from "xlsx"

import { validateCommitments } from "@/features/contracts/domain/commitments"
import { headcountGap } from "@/features/contracts/domain/headcount"
import { checkAddendum } from "@/features/contracts/domain/versions"
import {
  addendumInputSchema,
  contractCreateSchema,
  contractTemplateInputSchema,
  monthSchema,
  type VersionBody,
} from "@/features/contracts/model/contract"
import { contractListParamsSchema } from "@/entities/contract"
import { POSITION_LABELS } from "@/entities/personnel"
import { includesTr } from "@/shared/lib/format"
import { toIsoDate } from "@/shared/lib/date"
import { addMonths, monthOf } from "@/shared/lib/work-time"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockContract, MockContractVersion } from "../db/types"
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
import {
  computeHeadcountReport,
  computeLocationDetail,
  contractStatus,
  serializeContract,
  serializeContractSummary,
  serializeTemplate,
} from "./contracts"
import { MIN_WAGES } from "./min-wage"

const today = () => toIsoDate(mockClock.now())

/** Kullanıcının görebildiği sözleşmeler: müşteri kapsamı (bölge/lokasyon kapsamında en az bir lokasyon) */
export function visibleContracts(auth: AuthContext): MockContract[] {
  const scope = createScope(auth)
  return db.contracts.findMany((contract) => {
    if (contract.tenantId !== auth.tenant.slug) return false
    if (auth.scope.kind === "all") return true
    if (auth.scope.kind === "customers")
      return auth.scope.ids.includes(contract.customerId)
    return contract.versions.some((version) =>
      version.locations.some((location) =>
        scope.locationId(location.locationId)
      )
    )
  })
}

export function findContract(
  auth: AuthContext,
  id: string
): MockContract | null {
  return visibleContracts(auth).find((contract) => contract.id === id) ?? null
}

function toVersion(
  body: VersionBody,
  meta: {
    id: string
    number: number
    effectiveFrom: string
    effectiveTo: string
    note: string | null
    actor: string
  }
): MockContractVersion {
  return {
    id: meta.id,
    number: meta.number,
    effectiveFrom: meta.effectiveFrom,
    effectiveTo: meta.effectiveTo,
    note: meta.note,
    createdAt: mockClock.now().toISOString(),
    createdBy: meta.actor,
    serviceLines: body.serviceLines,
    scopeItems: body.scopeItems,
    locations: body.locations.map((location) => ({
      locationId: location.locationId,
      from: location.from,
      to: location.to,
    })),
    commitments: body.commitments,
    prices: body.prices,
    rules: body.rules,
  }
}

/** Sürüm gövdesinin sunucu kontrolleri (şemaya ek): 422 alan hataları */
function validateBody(
  tenantId: string,
  customerId: string,
  body: VersionBody,
  range: { from: string; to: string }
): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {}
  for (const [index, location] of body.locations.entries()) {
    const found = db.locations.findById(location.locationId)
    if (found?.tenantId !== tenantId || found.customerId !== customerId)
      errors[`body.locations.${index}.locationId`] = [
        "Lokasyon bu müşteriye ait değil",
      ]
    if (location.from < range.from || (location.to && location.to > range.to))
      errors[`body.locations.${index}.from`] = [
        "Kapsam tarihleri sözleşme süresi içinde olmalı",
      ]
  }
  const check = validateCommitments(body.commitments, body.locations)
  for (const issue of check.issues)
    errors[`body.commitments.${issue.index}.locationId`] = [issue.message]
  const priced = new Set(body.prices.unitPrices.map((item) => item.position))
  const missing = [
    ...new Set(
      body.commitments
        .map((item) => item.position)
        .filter((position) => !priced.has(position))
    ),
  ]
  if (missing.length > 0)
    errors["body.prices.unitPrices"] = [
      `Birim fiyatı eksik pozisyon: ${missing.map((p) => POSITION_LABELS[p]).join(", ")}`,
    ]
  return Object.keys(errors).length > 0 ? errors : null
}

const headcountQuerySchema = z.object({
  month: monthSchema.optional().catch(undefined),
  contractId: z.string().min(1).optional().catch(undefined),
  orgUnitId: z.string().min(1).optional().catch(undefined),
})

function headcountFor(auth: AuthContext, request: Request) {
  const query = parseQuery(request, headcountQuerySchema)
  const month = query.month ?? addMonths(monthOf(mockClock.now()), -1)
  const scope = createScope(auth)
  const units = query.orgUnitId
    ? descendantsOf(auth.tenant.slug, query.orgUnitId)
    : null
  const contracts = visibleContracts(auth).filter(
    (contract) => !query.contractId || contract.id === query.contractId
  )
  return computeHeadcountReport(contracts, month, mockClock.now(), (id) => {
    const location = db.locations.findById(id)
    if (!location || !scope.location(location)) return false
    return !units || units.has(location.orgUnitId)
  })
}

function descendantsOf(tenantId: string, rootId: string): Set<string> {
  const units = db.orgUnits.findMany((unit) => unit.tenantId === tenantId)
  const result = new Set([rootId])
  let added = true
  while (added) {
    added = false
    for (const unit of units) {
      if (unit.parentId && result.has(unit.parentId) && !result.has(unit.id)) {
        result.add(unit.id)
        added = true
      }
    }
  }
  return result
}

export const contractHandlers = [
  http.get(
    apiPath("/contracts"),
    withAuth("contract:read", ({ request, auth }) => {
      const params = parseQuery(request, contractListParamsSchema)
      const now = today()
      let items = visibleContracts(auth).map((contract) =>
        serializeContractSummary(contract, now)
      )
      items = items.filter(
        (item) =>
          (!params.type || item.type === params.type) &&
          (!params.status || item.status === params.status) &&
          (!params.customerId || item.customerId === params.customerId) &&
          (!params.legalEntityId ||
            item.contractorLegalEntityId === params.legalEntityId) &&
          (!params.q ||
            includesTr(
              `${item.code} ${item.title} ${item.customerName}`,
              params.q
            ))
      )
      const sort = params.sort ?? "code"
      const direction = params.order === "desc" ? -1 : 1
      items.sort((a, b) => a[sort].localeCompare(b[sort], "tr") * direction)
      return ok(paginate(items, params.page, params.pageSize))
    })
  ),
  http.get(
    apiPath("/contracts/options"),
    withAuth("contract:read", ({ request, auth }) => {
      const { customerId } = parseQuery(
        request,
        z.object({ customerId: z.string().min(1).optional().catch(undefined) })
      )
      const now = today()
      return ok({
        items: visibleContracts(auth)
          .filter(
            (contract) =>
              (!customerId || contract.customerId === customerId) &&
              contractStatus(contract, now) !== "upcoming"
          )
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((contract) => ({
            value: contract.id,
            label: `${contract.code} · ${contract.title}`,
            description: `${contract.startDate} – ${contract.endDate}`,
          })),
      })
    })
  ),
  http.get(
    apiPath("/contracts/headcount"),
    withAuth("contract:read", ({ request, auth }) =>
      ok(headcountFor(auth, request))
    )
  ),
  http.get(
    apiPath("/contracts/headcount/export"),
    withAuth("contract:read", ({ request, auth }) => {
      const report = headcountFor(auth, request)
      const sheet = XLSX.utils.aoa_to_sheet([
        [
          "Sözleşme",
          "Müşteri",
          "Bölge",
          "Lokasyon",
          "Planlı iş günü",
          "Taahhüt kadro",
          "Fiili kadro",
          "Fark",
          "Oran (%)",
        ],
        ...report.rows.map((row) => {
          const gap = headcountGap(row.committed, row.actual)
          return [
            `${row.contractCode} ${row.contractTitle}`,
            row.customerName,
            row.orgUnitName,
            row.locationName,
            row.plannedDays,
            row.committed,
            row.actual,
            gap.difference,
            Math.round(gap.ratio * 1000) / 10,
          ]
        }),
        [],
        [
          "Toplam",
          "",
          "",
          "",
          "",
          report.totals.committed,
          report.totals.actual,
          headcountGap(report.totals.committed, report.totals.actual)
            .difference,
        ],
      ])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, "Kadro raporu")
      const data = XLSX.write(workbook, {
        type: "array",
        bookType: "xlsx",
      }) as ArrayBuffer
      return fileResponse(
        new Uint8Array(data),
        `kadro-raporu-${report.month}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    })
  ),
  http.get(
    apiPath("/contracts/:contractId/headcount/locations/:locationId"),
    withAuth("contract:read", ({ request, params, auth }) => {
      const contract = findContract(auth, String(params.contractId))
      const locationId = String(params.locationId)
      if (!contract || !createScope(auth).locationId(locationId))
        return notFound()
      const { month } = parseQuery(request, headcountQuerySchema)
      return ok(
        computeLocationDetail(
          contract,
          locationId,
          month ?? addMonths(monthOf(mockClock.now()), -1),
          mockClock.now()
        )
      )
    })
  ),
  http.get(
    apiPath("/contracts/:contractId"),
    withAuth("contract:read", ({ params, auth }) => {
      const contract = findContract(auth, String(params.contractId))
      return contract ? ok(serializeContract(contract, today())) : notFound()
    })
  ),
  http.post(
    apiPath("/contracts"),
    withAuth("contract:write", async ({ request, auth }) => {
      const parsed = await parseBody(request, contractCreateSchema)
      if (!parsed.success) return parsed.response
      const { general, body } = parsed.data
      const tenantId = auth.tenant.slug
      const customer = db.customers.findById(general.customerId)
      const entity = db.legalEntities.findById(general.contractorLegalEntityId)
      if (customer?.tenantId !== tenantId)
        return problem(422, "VALIDATION", "Müşteri bulunamadı.", {
          "general.customerId": ["Müşteri bulunamadı"],
        })
      if (entity?.tenantId !== tenantId)
        return problem(422, "VALIDATION", "Tüzel kişilik bulunamadı.", {
          "general.contractorLegalEntityId": ["Tüzel kişilik bulunamadı"],
        })
      const range = { from: general.startDate, to: general.endDate }
      const errors = validateBody(tenantId, customer.id, body, range)
      if (errors)
        return problem(
          422,
          "VALIDATION",
          "Sözleşme bilgilerinde hata var.",
          errors
        )
      const sequence =
        db.contracts.count((contract) => contract.tenantId === tenantId) + 1
      const id = newId(`ct-${tenantId}`)
      const year = general.startDate.slice(0, 4)
      const contract: MockContract = {
        id,
        tenantId,
        code: `SOZ-${year}-${String(sequence).padStart(3, "0")}`,
        title: general.title,
        type: general.type,
        ikn: general.ikn.trim() === "" ? null : general.ikn.trim(),
        customerId: customer.id,
        contractorLegalEntityId: entity.id,
        startDate: general.startDate,
        endDate: general.endDate,
        terminatedAt: null,
        templateId: general.templateId,
        versions: [
          toVersion(body, {
            id: `${id}-v0`,
            number: 0,
            effectiveFrom: general.startDate,
            effectiveTo: general.endDate,
            note: null,
            actor: auth.actorName,
          }),
        ],
        updatedAt: mockClock.now().toISOString(),
      }
      db.contracts.insert(contract)
      audit(auth, {
        action: "Sözleşme oluşturuldu",
        targetType: "contract",
        targetLabel: `${contract.code} ${contract.title}`,
      })
      return created(serializeContract(contract, today()))
    })
  ),
  http.post(
    apiPath("/contracts/:contractId/versions"),
    withAuth("contract:write", async ({ request, params, auth }) => {
      const contract = findContract(auth, String(params.contractId))
      if (!contract) return notFound()
      const parsed = await parseBody(request, addendumInputSchema)
      if (!parsed.success) return parsed.response
      const input = parsed.data
      const check = checkAddendum(
        contract,
        contract.versions,
        input.effectiveFrom
      )
      if (!check.ok) {
        return check.code === "VERSION_OVERLAP"
          ? problem(409, "VERSION_OVERLAP", check.message)
          : problem(422, "VALIDATION", check.message, {
              effectiveFrom: [check.message],
            })
      }
      const errors = validateBody(
        contract.tenantId,
        contract.customerId,
        input.body,
        { from: contract.startDate, to: contract.endDate }
      )
      if (errors)
        return problem(422, "VALIDATION", "Zeyilnamede hata var.", errors)
      const number = Math.max(...contract.versions.map((v) => v.number)) + 1
      const versions = contract.versions.map((version) =>
        version.id === check.closes
          ? { ...version, effectiveTo: check.closesAt }
          : version
      )
      versions.push(
        toVersion(input.body, {
          id: `${contract.id}-v${number}`,
          number,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: contract.endDate,
          note: input.note,
          actor: auth.actorName,
        })
      )
      const updated = db.contracts.update(contract.id, {
        versions,
        updatedAt: mockClock.now().toISOString(),
      })!
      audit(auth, {
        action: "Zeyilname eklendi",
        targetType: "contract",
        targetLabel: `${contract.code} · ${number} no'lu zeyilname`,
        details: `Yürürlük: ${input.effectiveFrom}. ${input.note}`,
      })
      return created(serializeContract(updated, today()))
    })
  ),
  http.get(
    apiPath("/contract-templates"),
    withAuth("contract:read", ({ auth }) =>
      ok({
        items: db.contractTemplates
          .findMany((template) => template.tenantId === auth.tenant.slug)
          .map(serializeTemplate),
      })
    )
  ),
  http.post(
    apiPath("/contract-templates"),
    withAuth("contract:write", async ({ request, auth }) => {
      const parsed = await parseBody(request, contractTemplateInputSchema)
      if (!parsed.success) return parsed.response
      const template = db.contractTemplates.insert({
        id: newId(`cts-${auth.tenant.slug}`),
        tenantId: auth.tenant.slug,
        builtIn: false,
        updatedAt: mockClock.now().toISOString(),
        ...parsed.data,
      })
      audit(auth, {
        action: "Sözleşme şablonu oluşturuldu",
        targetType: "contract_template",
        targetLabel: template.name,
      })
      return created(serializeTemplate(template))
    })
  ),
  http.put(
    apiPath("/contract-templates/:templateId"),
    withAuth("contract:write", async ({ request, params, auth }) => {
      const template = db.contractTemplates.findById(String(params.templateId))
      if (template?.tenantId !== auth.tenant.slug) return notFound()
      if (template.builtIn)
        return problem(
          409,
          "BUILT_IN",
          "Hazır şablon değiştirilemez; çoğaltıp düzenleyin."
        )
      const parsed = await parseBody(request, contractTemplateInputSchema)
      if (!parsed.success) return parsed.response
      const updated = db.contractTemplates.update(template.id, {
        ...parsed.data,
        updatedAt: mockClock.now().toISOString(),
      })!
      audit(auth, {
        action: "Sözleşme şablonu güncellendi",
        targetType: "contract_template",
        targetLabel: updated.name,
      })
      return ok(serializeTemplate(updated))
    })
  ),
  http.get(
    apiPath("/reference/min-wage"),
    withAuth(null, () => ok({ items: MIN_WAGES }))
  ),
]
