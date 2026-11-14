import { http } from "msw"

import { addMonthsIso } from "@/entities/ohs"
import {
  healthListParamsSchema,
  healthRecordInputSchema,
  revealInputSchema,
  type AccessLogRow,
  type HealthDue,
  type HealthListRow,
  type HealthRecord,
} from "@/features/health-surveillance/model/health"
import { includesTr } from "@/shared/lib/format"
import { listParamsSchema } from "@/shared/types"
import { addDaysIso } from "@/shared/lib/work-time"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockHealthRecord, MockPersonnel } from "../db/types"
import { apiPath, notFound, ok, parseBody, parseQuery, problem } from "../http"
import { paginate } from "../operations/common"
import { HEALTH_EXAM_YEARS } from "./catalog"
import { visiblePersonnel } from "./ohs-handlers"
import {
  locationLabels,
  ohsRules,
  personHazardClass,
  personName,
  today,
} from "./store"

/**
 * Sağlık gözetimi uçları. Hepsi `health:*` ister; platform destek oturumu bu yetkiyi hiçbir
 * koşulda almaz (SUPPORT_PERMISSIONS). Liste maskelidir; açık veri yalnızca gerekçeli
 * görüntüleme ucundan döner ve her erişim kayda geçer.
 */
function dueOf(record: MockHealthRecord | null, onDate: string): HealthDue {
  if (!record) return "none"
  if (record.nextExamAt < onDate) return "overdue"
  if (record.nextExamAt <= addDaysIso(onDate, 30)) return "d30"
  return "ok"
}

function serializeRecord(record: MockHealthRecord): HealthRecord {
  return {
    personnelId: record.personnelId,
    examinedAt: record.examinedAt,
    nextExamAt: record.nextExamAt,
    result: record.result,
    vaccinations: record.vaccinations,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  }
}

function findPerson(auth: AuthContext, id: string): MockPersonnel | null {
  const person = db.personnel.findById(id)
  return person && createScope(auth).personnel(person) ? person : null
}

function logAccess(
  auth: AuthContext,
  person: MockPersonnel,
  action: "reveal" | "update",
  reason: string
) {
  db.healthAccessLogs.insert({
    id: newId("hal"),
    tenantId: auth.tenant.slug,
    occurredAt: mockClock.now().toISOString(),
    actorName: auth.actorName,
    personnelId: person.id,
    action,
    reason,
  })
  // Kiracının genel denetim kaydına da düşer (gerekçe metni yalnızca erişim kaydında)
  audit(auth, {
    action:
      action === "reveal"
        ? "Sağlık verisi görüntülendi"
        : "Sağlık verisi güncellendi",
    targetType: "health_record",
    targetLabel: `${personName(person)} (${person.employeeNumber})`,
  })
}

export const healthHandlers = [
  http.get(
    apiPath("/health/records"),
    withAuth("health:read", ({ request, auth }) => {
      const query = parseQuery(request, healthListParamsSchema)
      const onDate = today()
      const records = new Map(
        db.healthRecords
          .findMany((record) => record.tenantId === auth.tenant.slug)
          .map((record) => [record.personnelId, record])
      )
      const rows: HealthListRow[] = visiblePersonnel(auth)
        .map((person) => {
          const record = records.get(person.id) ?? null
          const labels = locationLabels(person.homeLocationId)
          return {
            personnelId: person.id,
            name: personName(person),
            employeeNumber: person.employeeNumber,
            locationName: labels.locationName,
            orgUnitName: labels.orgUnitName,
            orgUnitId: labels.orgUnitId,
            nextExamMonth: record?.nextExamAt.slice(0, 7) ?? null,
            due: dueOf(record, onDate),
          }
        })
        .filter(
          (row) =>
            (!query.due || row.due === query.due) &&
            (!query.orgUnitId || row.orgUnitId === query.orgUnitId) &&
            (!query.q ||
              includesTr(`${row.name} ${row.employeeNumber}`, query.q))
        )
        .map(({ orgUnitId: _orgUnitId, ...row }) => row)
      const rank: Record<HealthDue, number> = {
        overdue: 0,
        none: 1,
        d30: 2,
        ok: 3,
      }
      rows.sort(
        (a, b) =>
          rank[a.due] - rank[b.due] ||
          (a.nextExamMonth ?? "").localeCompare(b.nextExamMonth ?? "") ||
          a.name.localeCompare(b.name, "tr")
      )
      return ok(paginate(rows, query.page, query.pageSize))
    })
  ),
  http.post(
    apiPath("/health/records/:personnelId/reveal"),
    withAuth("health:read", async ({ request, params, auth }) => {
      const person = findPerson(auth, String(params.personnelId))
      if (!person) return notFound()
      const body = await parseBody(request, revealInputSchema)
      if (!body.success) return body.response
      logAccess(auth, person, "reveal", body.data.reason)
      const record = db.healthRecords.findFirst(
        (item) => item.personnelId === person.id
      )
      return ok(
        {
          personnelId: person.id,
          record: record ? serializeRecord(record) : null,
        },
        { headers: { "Cache-Control": "no-store, private" } }
      )
    })
  ),
  http.put(
    apiPath("/health/records/:personnelId"),
    withAuth("health:write", async ({ request, params, auth }) => {
      const person = findPerson(auth, String(params.personnelId))
      if (!person) return notFound()
      const body = await parseBody(request, healthRecordInputSchema)
      if (!body.success) return body.response
      if (body.data.examinedAt > today())
        return problem(
          422,
          "VALIDATION_FAILED",
          "Muayene tarihi ileri bir tarih olamaz.",
          {
            examinedAt: ["Muayene tarihi ileri bir tarih olamaz"],
          }
        )
      const hazard = personHazardClass(person, ohsRules(auth.tenant))
      const values = {
        examinedAt: body.data.examinedAt,
        nextExamAt: addMonthsIso(
          body.data.examinedAt,
          HEALTH_EXAM_YEARS[hazard] * 12
        ),
        result: body.data.result,
        vaccinations: body.data.vaccinations,
        updatedAt: mockClock.now().toISOString(),
        updatedBy: auth.actorName,
      }
      const existing = db.healthRecords.findFirst(
        (item) => item.personnelId === person.id
      )
      const record = existing
        ? (db.healthRecords.update(existing.id, values) ?? existing)
        : db.healthRecords.insert({
            id: newId("hl"),
            tenantId: auth.tenant.slug,
            personnelId: person.id,
            ...values,
          })
      logAccess(auth, person, "update", "Muayene kaydı güncellendi")
      return ok(
        { personnelId: person.id, record: serializeRecord(record) },
        { headers: { "Cache-Control": "no-store, private" } }
      )
    })
  ),
  http.get(
    apiPath("/health/access-logs"),
    withAuth("health:read", ({ request, auth }) => {
      const query = parseQuery(request, listParamsSchema)
      const items: AccessLogRow[] = db.healthAccessLogs
        .findMany((log) => log.tenantId === auth.tenant.slug)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .map((log) => {
          const person = db.personnel.findById(log.personnelId)
          return {
            id: log.id,
            occurredAt: log.occurredAt,
            actorName: log.actorName,
            personnelId: log.personnelId,
            personnelName: person ? personName(person) : "—",
            action: log.action,
            reason: log.reason,
          }
        })
        .filter(
          (row) =>
            !query.q ||
            includesTr(
              `${row.actorName} ${row.personnelName} ${row.reason}`,
              query.q
            )
        )
      return ok(paginate(items, query.page, query.pageSize))
    })
  ),
]
