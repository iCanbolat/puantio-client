import { http } from "msw"
import { z } from "zod"
import * as XLSX from "xlsx"

import {
  buildPayrollTable,
  payrollFileName,
  renderTextFile,
  type PayrollSourceRow,
} from "@/features/payroll-export/domain/build-table"
import {
  exportRequestSchema,
  payrollProfileSettingsSchema,
  type PayrollProfile,
  type PayrollProfileSettings,
} from "@/features/payroll-export/model/profile"
import {
  isPeriodEditable,
  nextPeriodStatus,
  tracksChanges,
} from "@/features/timesheet/domain/period"
import { CELL_CODE_LABELS } from "@/features/timesheet/model/cell-code"
import {
  PERIOD_ACTION_LABELS,
  cellUpdateSchema,
  periodActionSchema,
  timesheetGridParamsSchema,
} from "@/features/timesheet/model/timesheet"
import type { Permission } from "@/entities/session"
import { includesTr } from "@/shared/lib/format"
import { monthRange } from "@/shared/lib/work-time"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type {
  MockPayrollExport,
  MockPayrollProfile,
  MockTimesheetPeriod,
} from "../db/types"
import {
  apiPath,
  created,
  fileResponse,
  noContent,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import { scopedLocationIds } from "./common"
import { holidaysBetween } from "./holidays"
import {
  computeRows,
  ensurePeriods,
  periodPersonnel,
  serializePeriod,
} from "./timesheet"

const ACTION_PERMISSION: Record<string, Permission> = {
  approve_region: "timesheet:approve_region",
  approve_customer: "timesheet:approve_customer",
  approve_hr: "timesheet:approve_hr",
  lock: "timesheet:approve_hr",
  reopen: "timesheet:approve_hr",
}

function findPeriod(auth: AuthContext, id: string): MockTimesheetPeriod | null {
  ensurePeriods(auth.tenant, mockClock.now())
  const period = db.timesheetPeriods.findById(id)
  return period && period.tenantId === auth.tenant.slug ? period : null
}

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`))

/* ─────────────────────────────── Bordro ─────────────────────────────── */

function serializeProfile(profile: MockPayrollProfile): PayrollProfile {
  const { tenantId, ...rest } = profile
  return {
    ...(rest as unknown as Omit<PayrollProfile, "legalEntityIds">),
    legalEntityIds: db.legalEntities
      .findMany(
        (entity) =>
          entity.tenantId === tenantId && entity.payrollProfileId === profile.id
      )
      .map((entity) => entity.id),
  }
}

function payrollSource(period: MockTimesheetPeriod): {
  rows: PayrollSourceRow[]
  context: { year: number; month: number; legalEntityTitle: string }
  shortName: string
} {
  const people = periodPersonnel(period)
  const rows = computeRows(period, people, mockClock.now())
  const byId = new Map(people.map((person) => [person.id, person]))
  const locations = new Map(
    db.locations
      .findMany((location) => location.tenantId === period.tenantId)
      .map((location) => [location.id, location.code])
  )
  const entity = db.legalEntities.findById(period.legalEntityId)
  const [year, month] = period.month.split("-").map(Number)
  return {
    rows: rows.map((row) => {
      const person = byId.get(row.personnelId)!
      return {
        personnelId: row.personnelId,
        employeeNumber: person.employeeNumber,
        tckn: person.tckn,
        firstName: person.firstName,
        lastName: person.lastName,
        locationCode: person.homeLocationId
          ? (locations.get(person.homeLocationId) ?? "")
          : "YEDEK",
        cells: row.cells,
      }
    }),
    context: {
      year: year ?? 0,
      month: month ?? 0,
      legalEntityTitle: entity?.title ?? "",
    },
    shortName: (entity?.title.split(" ")[0] ?? "firma").toLocaleLowerCase("tr"),
  }
}

function buildFile(
  profile: PayrollProfileSettings,
  table: ReturnType<typeof buildPayrollTable>
): { bytes: Uint8Array; contentType: string } {
  if (profile.format === "xlsx") {
    const sheet = XLSX.utils.aoa_to_sheet([
      ...(profile.includeHeader ? [table.headers] : []),
      ...table.rows.map((row) => row.values),
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, "Puantaj")
    const data = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
    }) as ArrayBuffer
    return {
      bytes: new Uint8Array(data),
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
  }
  const charset = profile.encoding === "windows-1254" ? "windows-1254" : "utf-8"
  return {
    bytes: renderTextFile(table, profile),
    contentType: `${profile.format === "csv" ? "text/csv" : "text/plain"}; charset=${charset}`,
  }
}

function serializeExport(item: MockPayrollExport) {
  const period = db.timesheetPeriods.findById(item.periodId)
  const entity = period
    ? db.legalEntities.findById(period.legalEntityId)
    : undefined
  return {
    id: item.id,
    periodId: item.periodId,
    periodLabel: period ? monthLabel(period.month) : "—",
    legalEntityTitle: entity?.title ?? "—",
    profileId: item.profileId,
    profileName: item.profileName,
    fileName: item.fileName,
    format: item.format,
    encoding: item.encoding,
    rowCount: item.rowCount,
    createdAt: item.createdAt,
    createdBy: item.createdBy,
  }
}

function toSettings(profile: MockPayrollProfile): PayrollProfileSettings {
  return payrollProfileSettingsSchema.parse(profile)
}

export const timesheetHandlers = [
  http.get(
    apiPath("/timesheet/periods"),
    withAuth("timesheet:read", ({ request, auth }) => {
      const { legalEntityId } = parseQuery(
        request,
        z.object({
          legalEntityId: z.string().min(1).optional().catch(undefined),
        })
      )
      ensurePeriods(auth.tenant, mockClock.now())
      const items = db.timesheetPeriods
        .findMany(
          (period) =>
            period.tenantId === auth.tenant.slug &&
            (!legalEntityId || period.legalEntityId === legalEntityId)
        )
        .map((period) => serializePeriod(period, auth.permissions))
        .sort(
          (a, b) =>
            b.month.localeCompare(a.month) ||
            a.legalEntityTitle.localeCompare(b.legalEntityTitle, "tr")
        )
      return ok({ items })
    })
  ),
  http.get(
    apiPath("/timesheet/periods/:id"),
    withAuth("timesheet:read", ({ params, auth }) => {
      const period = findPeriod(auth, String(params.id))
      if (!period) return notFound()
      return ok(serializePeriod(period, auth.permissions))
    })
  ),
  http.get(
    apiPath("/timesheet/periods/:id/rows"),
    withAuth("timesheet:read", ({ request, params, auth }) => {
      const period = findPeriod(auth, String(params.id))
      if (!period) return notFound()
      const query = parseQuery(request, timesheetGridParamsSchema)
      const scope = createScope(auth)
      const allowed =
        query.orgUnitId || query.locationId
          ? scopedLocationIds(auth, query)
          : null
      const people = periodPersonnel(
        period,
        (person) =>
          scope.personnel(person) &&
          (!allowed ||
            (person.homeLocationId !== null &&
              allowed.has(person.homeLocationId))) &&
          (!query.q ||
            includesTr(
              `${person.firstName} ${person.lastName} ${person.employeeNumber}`,
              query.q
            ))
      ).sort((a, b) => a.lastName.localeCompare(b.lastName, "tr"))
      const range = monthRange(period.month)
      return ok({
        period: serializePeriod(period, auth.permissions),
        days: Array.from(
          { length: range.days },
          (_, index) => `${period.month}-${String(index + 1).padStart(2, "0")}`
        ),
        holidays: holidaysBetween(range.from, range.to),
        rows: computeRows(period, people, mockClock.now()),
      })
    })
  ),
  http.patch(
    apiPath("/timesheet/periods/:id/cells"),
    withAuth("timesheet:read", async ({ request, params, auth }) => {
      if (
        !auth.permissions.has("timesheet:approve_region") &&
        !auth.permissions.has("timesheet:approve_hr")
      ) {
        return problem(403, "FORBIDDEN", "Puantaj düzenleme yetkiniz yok.")
      }
      const period = findPeriod(auth, String(params.id))
      if (!period) return notFound()
      const body = await parseBody(request, cellUpdateSchema)
      if (!body.success) return body.response
      if (!isPeriodEditable(period.status)) {
        return problem(
          409,
          "PERIOD_LOCKED",
          period.status === "locked"
            ? "Dönem kilitli; puantaj düzenlenemez."
            : "Dönem İK onaylı; düzenleme için dönemi yeniden açın."
        )
      }
      const person = db.personnel.findById(body.data.personnelId)
      if (
        !person ||
        person.legalEntityId !== period.legalEntityId ||
        !createScope(auth).personnel(person) ||
        !body.data.date.startsWith(period.month)
      ) {
        return notFound()
      }
      const now = mockClock.now()
      const [before] = computeRows(period, [person], now).map(
        (row) =>
          row.cells.find((cell) => cell.date === body.data.date)?.code ?? null
      )
      const id = `${period.id}|${person.id}|${body.data.date}`
      const record = {
        tenantId: auth.tenant.slug,
        periodId: period.id,
        personnelId: person.id,
        date: body.data.date,
        code: body.data.code,
        overtimeHours: body.data.code === "FM" ? body.data.overtimeHours : 0,
        by: auth.actorName,
        at: now.toISOString(),
      }
      if (db.timesheetOverrides.findById(id))
        db.timesheetOverrides.update(id, record)
      else db.timesheetOverrides.insert({ id, ...record })
      if (tracksChanges(period.status)) {
        db.timesheetPeriods.update(period.id, {
          changes: [
            ...period.changes,
            {
              at: now.toISOString(),
              actor: auth.actorName,
              personnelId: person.id,
              date: body.data.date,
              before: before ?? null,
              after: body.data.code,
            },
          ],
        })
      }
      audit(auth, {
        action: "Puantaj hücresi düzeltildi",
        targetType: "timesheet",
        targetLabel: `${person.firstName} ${person.lastName} · ${body.data.date}`,
        details: `${before ?? "boş"} → ${body.data.code} (${CELL_CODE_LABELS[body.data.code]})`,
      })
      const cell = computeRows(period, [person], now)[0]!.cells.find(
        (item) => item.date === body.data.date
      )!
      return ok(cell)
    })
  ),
  http.post(
    apiPath("/timesheet/periods/:id/transition"),
    withAuth(null, async ({ request, params, auth }) => {
      const period = findPeriod(auth, String(params.id))
      if (!period) return notFound()
      const body = await parseBody(
        request,
        z.object({ action: periodActionSchema })
      )
      if (!body.success) return body.response
      const permission = ACTION_PERMISSION[body.data.action]
      if (!permission || !auth.permissions.has(permission)) {
        return problem(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.")
      }
      const next = nextPeriodStatus(
        period.status,
        body.data.action,
        period.customerApprovalRequired
      )
      if (!next) {
        return problem(
          409,
          "INVALID_TRANSITION",
          "Dönemin durumu bu işleme uygun değil; sayfayı yenileyin."
        )
      }
      const label = PERIOD_ACTION_LABELS[body.data.action]
      const updated = db.timesheetPeriods.update(period.id, {
        status: next,
        history: [
          ...period.history,
          {
            at: mockClock.now().toISOString(),
            actor: auth.actorName,
            action: label,
          },
        ],
      })!
      const entity = db.legalEntities.findById(period.legalEntityId)
      audit(auth, {
        action: `Puantaj: ${label}`,
        targetType: "timesheet_period",
        targetLabel: `${entity?.title ?? period.legalEntityId} · ${monthLabel(period.month)}`,
      })
      return ok(serializePeriod(updated, auth.permissions))
    })
  ),
  http.get(
    apiPath("/portal/timesheet-approvals"),
    withAuth("timesheet:approve_customer", ({ auth }) => {
      ensurePeriods(auth.tenant, mockClock.now())
      const items = db.timesheetPeriods
        .findMany(
          (period) =>
            period.tenantId === auth.tenant.slug &&
            period.customerApprovalRequired &&
            period.status === "region_approved"
        )
        .map((period) => serializePeriod(period, auth.permissions))
      return ok({ items })
    })
  ),

  /* ─────────────── Bordro aktarım profilleri ve dışa aktarma ─────────────── */
  http.get(
    apiPath("/payroll/profiles"),
    withAuth("payroll:export", ({ auth }) => {
      const items = db.payrollProfiles
        .findMany((profile) => profile.tenantId === auth.tenant.slug)
        .map(serializeProfile)
      return ok({ items })
    })
  ),
  http.post(
    apiPath("/payroll/profiles"),
    withAuth("payroll:profiles", async ({ request, auth }) => {
      const body = await parseBody(
        request,
        z.object({
          sourceProfileId: z.string().min(1),
          name: z.string().trim().min(3).max(80),
        })
      )
      if (!body.success) return body.response
      const source = db.payrollProfiles.findById(body.data.sourceProfileId)
      if (!source || source.tenantId !== auth.tenant.slug) return notFound()
      const copy = db.payrollProfiles.insert({
        ...source,
        id: newId("pp"),
        name: body.data.name,
        libraryKey: null,
        updatedAt: mockClock.now().toISOString(),
      })
      audit(auth, {
        action: "Bordro profili çoğaltıldı",
        targetType: "payroll_profile",
        targetLabel: copy.name,
        details: `Kaynak: ${source.name}`,
      })
      return created(serializeProfile(copy))
    })
  ),
  http.put(
    apiPath("/payroll/profiles/:id"),
    withAuth("payroll:profiles", async ({ request, params, auth }) => {
      const profile = db.payrollProfiles.findById(String(params.id))
      if (!profile || profile.tenantId !== auth.tenant.slug) return notFound()
      if (profile.libraryKey) {
        return problem(
          409,
          "LIBRARY_PROFILE",
          "Hazır profil düzenlenemez; önce çoğaltın."
        )
      }
      const body = await parseBody(request, payrollProfileSettingsSchema)
      if (!body.success) return body.response
      const updated = db.payrollProfiles.update(profile.id, {
        ...body.data,
        updatedAt: mockClock.now().toISOString(),
      })!
      audit(auth, {
        action: "Bordro profili güncellendi",
        targetType: "payroll_profile",
        targetLabel: updated.name,
      })
      return ok(serializeProfile(updated))
    })
  ),
  http.delete(
    apiPath("/payroll/profiles/:id"),
    withAuth("payroll:profiles", ({ params, auth }) => {
      const profile = db.payrollProfiles.findById(String(params.id))
      if (!profile || profile.tenantId !== auth.tenant.slug) return notFound()
      if (profile.libraryKey) {
        return problem(409, "LIBRARY_PROFILE", "Hazır profil silinemez.")
      }
      if (serializeProfile(profile).legalEntityIds.length > 0) {
        return problem(
          409,
          "PROFILE_IN_USE",
          "Profil bir tüzel kişiliğin varsayılanı; önce değiştirin."
        )
      }
      db.payrollProfiles.remove(profile.id)
      return noContent()
    })
  ),
  http.put(
    apiPath("/legal-entities/:id/payroll-profile"),
    withAuth("payroll:profiles", async ({ request, params, auth }) => {
      const entity = db.legalEntities.findById(String(params.id))
      if (!entity || entity.tenantId !== auth.tenant.slug) return notFound()
      const body = await parseBody(
        request,
        z.object({ profileId: z.string().min(1) })
      )
      if (!body.success) return body.response
      const profile = db.payrollProfiles.findById(body.data.profileId)
      if (!profile || profile.tenantId !== auth.tenant.slug) {
        return problem(422, "VALIDATION_FAILED", "Profil bulunamadı.", {
          profileId: ["Profil bulunamadı."],
        })
      }
      db.legalEntities.update(entity.id, { payrollProfileId: profile.id })
      audit(auth, {
        action: "Varsayılan bordro profili değişti",
        targetType: "legal_entity",
        targetLabel: entity.title,
        details: profile.name,
      })
      return ok({ legalEntityId: entity.id, profileId: profile.id })
    })
  ),
  http.post(
    apiPath("/payroll-exports/preview"),
    withAuth("payroll:export", async ({ request, auth }) => {
      const body = await parseBody(request, exportRequestSchema)
      if (!body.success) return body.response
      const period = findPeriod(auth, body.data.periodId)
      const profile = db.payrollProfiles.findById(body.data.profileId)
      if (!period || !profile || profile.tenantId !== auth.tenant.slug)
        return notFound()
      const settings = toSettings(profile)
      const source = payrollSource(period)
      const table = buildPayrollTable(settings, source.context, source.rows)
      const errorRows = table.rows.filter((row) => row.errors.length > 0)
      const okRows = table.rows.filter((row) => row.errors.length === 0)
      return ok({
        headers: table.headers,
        // Hatalı satırlar önce: kullanıcı düzeltmesi gerekenleri hemen görür
        rows: [...errorRows, ...okRows].slice(0, 50),
        totalRows: table.rows.length,
        errorRows: errorRows.length,
        fileName: payrollFileName(settings, source.context, source.shortName),
      })
    })
  ),
  http.post(
    apiPath("/payroll-exports"),
    withAuth("payroll:export", async ({ request, auth }) => {
      const body = await parseBody(request, exportRequestSchema)
      if (!body.success) return body.response
      const period = findPeriod(auth, body.data.periodId)
      const profile = db.payrollProfiles.findById(body.data.profileId)
      if (!period || !profile || profile.tenantId !== auth.tenant.slug)
        return notFound()
      if (period.status !== "hr_approved" && period.status !== "locked") {
        return problem(
          409,
          "PERIOD_NOT_APPROVED",
          "Bordro aktarımı için dönem İK onaylı veya kilitli olmalı."
        )
      }
      const settings = toSettings(profile)
      const source = payrollSource(period)
      const table = buildPayrollTable(settings, source.context, source.rows)
      const errors = table.rows.filter((row) => row.errors.length > 0).length
      if (errors > 0) {
        return problem(
          422,
          "PAYROLL_VALIDATION",
          `${errors} satırda hata var; dışa aktarım engellendi.`
        )
      }
      const file = buildFile(settings, table)
      const fileName = payrollFileName(
        settings,
        source.context,
        source.shortName
      )
      const record = db.payrollExports.insert({
        id: newId("pex"),
        tenantId: auth.tenant.slug,
        periodId: period.id,
        profileId: profile.id,
        profileName: profile.name,
        fileName,
        format: settings.format,
        encoding: settings.encoding,
        rowCount: table.rows.length,
        createdAt: mockClock.now().toISOString(),
        createdBy: auth.actorName,
        bytes: file.bytes,
        contentType: file.contentType,
      })
      audit(auth, {
        action: "Bordro dosyası üretildi",
        targetType: "payroll_export",
        targetLabel: fileName,
        details: `${profile.name} · ${table.rows.length} satır`,
      })
      return created(serializeExport(record))
    })
  ),
  http.get(
    apiPath("/payroll-exports"),
    withAuth("payroll:export", ({ request, auth }) => {
      const { periodId } = parseQuery(
        request,
        z.object({ periodId: z.string().min(1).optional().catch(undefined) })
      )
      const items = db.payrollExports
        .findMany(
          (item) =>
            item.tenantId === auth.tenant.slug &&
            (!periodId || item.periodId === periodId)
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(serializeExport)
      return ok({ items })
    })
  ),
  http.get(
    apiPath("/payroll-exports/:id/file"),
    withAuth("payroll:export", ({ params, auth }) => {
      const item = db.payrollExports.findById(String(params.id))
      if (!item || item.tenantId !== auth.tenant.slug) return notFound()
      return fileResponse(
        new Uint8Array(item.bytes),
        item.fileName,
        item.contentType
      )
    })
  ),
]
