import { http } from "msw"
import { z } from "zod"

import {
  locationAttendanceRulesSchema,
  scheduleBatchSchema,
  shiftTemplateInputSchema,
  type LocationSchedule,
  type ShiftAssignment,
  type ShiftTemplate,
} from "@/entities/shift"
import { LEAVE_TYPE_LABELS } from "@/entities/leave"
import { addDaysIso } from "@/shared/lib/work-time"

import { audit, createScope, withAuth } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockShiftAssignment, MockShiftTemplate } from "../db/types"
import {
  apiPath,
  created,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import { isoDateRangeValid } from "./common"
import { rand } from "./hash"
import { holidaysBetween } from "./holidays"
import {
  approvedLeaveOn,
  assignmentsBetween,
  buildAssignment,
  ensureRange,
} from "./plan"
import {
  addAssignment,
  bumpLocationVersion,
  locationVersion,
  ops,
  removeAssignment,
} from "./store"

export function serializeTemplate(template: MockShiftTemplate): ShiftTemplate {
  const { tenantId: _tenantId, ...rest } = template
  return rest as ShiftTemplate
}

export function serializeAssignment(
  assignment: MockShiftAssignment,
  locationNames: Map<string, string>
): ShiftAssignment {
  return {
    id: assignment.id as ShiftAssignment["id"],
    personnelId: assignment.personnelId,
    locationId: assignment.locationId,
    locationName: locationNames.get(assignment.locationId) ?? "—",
    date: assignment.date,
    templateId: assignment.templateId as ShiftAssignment["templateId"],
    code: assignment.code,
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
    breakMinutes: assignment.breakMinutes,
    kind: assignment.kind,
  }
}

const rangeQuery = z.object({
  locationId: z.string().min(1),
  from: z.iso.date(),
  to: z.iso.date(),
})

const overlaps = (a: MockShiftAssignment, b: MockShiftAssignment) =>
  Date.parse(a.startsAt) < Date.parse(b.endsAt) &&
  Date.parse(b.startsAt) < Date.parse(a.endsAt)

export const scheduleHandlers = [
  http.get(
    apiPath("/shift-templates"),
    withAuth(null, ({ auth }) => {
      if (
        !auth.permissions.has("schedule:read") &&
        !auth.permissions.has("attendance:read")
      ) {
        return problem(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.")
      }
      const items = db.shiftTemplates
        .findMany((template) => template.tenantId === auth.tenant.slug)
        .map(serializeTemplate)
      return ok({ items })
    })
  ),
  http.post(
    apiPath("/shift-templates"),
    withAuth("schedule:write", async ({ request, auth }) => {
      const body = await parseBody(request, shiftTemplateInputSchema)
      if (!body.success) return body.response
      const code = body.data.code.toLocaleUpperCase("tr")
      if (
        db.shiftTemplates.findFirst(
          (item) => item.tenantId === auth.tenant.slug && item.code === code
        )
      ) {
        return problem(422, "VALIDATION_FAILED", "Kısa kod kullanılıyor.", {
          code: ["Bu kısa kod başka bir şablonda kullanılıyor."],
        })
      }
      const template = db.shiftTemplates.insert({
        id: newId("tpl"),
        tenantId: auth.tenant.slug,
        ...body.data,
        code,
        rotation: null,
        isActive: true,
      })
      audit(auth, {
        action: "Vardiya şablonu eklendi",
        targetType: "shift_template",
        targetLabel: template.name,
      })
      return created(serializeTemplate(template))
    })
  ),
  http.patch(
    apiPath("/shift-templates/:id/status"),
    withAuth("schedule:write", async ({ request, params, auth }) => {
      const template = db.shiftTemplates.findById(String(params.id))
      if (!template || template.tenantId !== auth.tenant.slug) return notFound()
      const body = await parseBody(request, z.object({ isActive: z.boolean() }))
      if (!body.success) return body.response
      const updated = db.shiftTemplates.update(template.id, body.data)!
      return ok(serializeTemplate(updated))
    })
  ),
  http.patch(
    apiPath("/shift-templates/:id"),
    withAuth("schedule:write", async ({ request, params, auth }) => {
      const template = db.shiftTemplates.findById(String(params.id))
      if (!template || template.tenantId !== auth.tenant.slug) return notFound()
      if (template.kind === "rotation") {
        return problem(
          409,
          "ROTATION_READONLY",
          "Rotasyon şablonu düzenlenemez."
        )
      }
      const body = await parseBody(request, shiftTemplateInputSchema)
      if (!body.success) return body.response
      const code = body.data.code.toLocaleUpperCase("tr")
      if (
        db.shiftTemplates.findFirst(
          (item) =>
            item.tenantId === auth.tenant.slug &&
            item.code === code &&
            item.id !== template.id
        )
      ) {
        return problem(422, "VALIDATION_FAILED", "Kısa kod kullanılıyor.", {
          code: ["Bu kısa kod başka bir şablonda kullanılıyor."],
        })
      }
      const updated = db.shiftTemplates.update(template.id, {
        ...body.data,
        code,
      })!
      audit(auth, {
        action: "Vardiya şablonu güncellendi",
        targetType: "shift_template",
        targetLabel: updated.name,
      })
      return ok(serializeTemplate(updated))
    })
  ),
  http.get(
    apiPath("/locations/:id/attendance-rules"),
    withAuth("schedule:read", ({ params, auth }) => {
      const id = String(params.id)
      if (!createScope(auth).locationId(id)) return notFound()
      const rules = db.locationRules.findById(id)
      return ok({
        locationId: id,
        lateToleranceMinutes: rules?.lateToleranceMinutes ?? null,
        alarmSlaMinutes: rules?.alarmSlaMinutes ?? null,
      })
    })
  ),
  http.put(
    apiPath("/locations/:id/attendance-rules"),
    withAuth("schedule:write", async ({ request, params, auth }) => {
      const id = String(params.id)
      const location = db.locations.findById(id)
      if (!location || !createScope(auth).location(location)) return notFound()
      const body = await parseBody(
        request,
        locationAttendanceRulesSchema.omit({ locationId: true })
      )
      if (!body.success) return body.response
      const tenantSla = auth.tenant.rules.alarmSlaMinutes
      if (
        body.data.alarmSlaMinutes !== null &&
        body.data.alarmSlaMinutes > tenantSla
      ) {
        return problem(
          422,
          "VALIDATION_FAILED",
          "SLA kiracı varsayılanından uzun olamaz.",
          {
            alarmSlaMinutes: [
              `Lokasyon SLA'sı en fazla ${tenantSla} dk olabilir (yalnızca daraltılabilir).`,
            ],
          }
        )
      }
      if (db.locationRules.findById(id)) db.locationRules.update(id, body.data)
      else
        db.locationRules.insert({
          id,
          tenantId: auth.tenant.slug,
          ...body.data,
        })
      audit(auth, {
        action: "Lokasyon yoklama kuralları güncellendi",
        targetType: "location",
        targetLabel: location.name,
        details: `Tolerans: ${body.data.lateToleranceMinutes ?? "varsayılan"} · SLA: ${body.data.alarmSlaMinutes ?? "varsayılan"}`,
      })
      return ok({ locationId: id, ...body.data })
    })
  ),
  http.get(
    apiPath("/schedule"),
    withAuth("schedule:read", ({ request, auth }) => {
      const query = parseQuery(request, rangeQuery)
      if (!isoDateRangeValid(query.from, query.to, 62)) {
        return problem(
          400,
          "INVALID_RANGE",
          "Tarih aralığı en fazla 62 gün olabilir."
        )
      }
      const location = db.locations.findById(query.locationId)
      if (!location || !createScope(auth).location(location)) return notFound()
      const tenantId = auth.tenant.slug
      const wideFrom = addDaysIso(query.from, -7)
      const wideTo = addDaysIso(query.to, 7)
      ensureRange(tenantId, wideFrom, wideTo)

      const atLocation = assignmentsBetween(
        tenantId,
        query.from,
        query.to,
        (assignment) => assignment.locationId === location.id
      )
      const rosterIds = new Set([
        ...db.personnel
          .findMany(
            (person) =>
              person.tenantId === tenantId &&
              person.homeLocationId === location.id &&
              person.status === "active"
          )
          .map((person) => person.id),
        ...atLocation.map((assignment) => assignment.personnelId),
      ])
      const roster = db.personnel
        .findMany((person) => rosterIds.has(person.id))
        .sort(
          (a, b) =>
            Number(a.isFloater) - Number(b.isFloater) ||
            a.lastName.localeCompare(b.lastName, "tr")
        )
        .map((person) => ({
          id: person.id,
          name: `${person.firstName} ${person.lastName}`,
          employeeNumber: person.employeeNumber,
          position: person.position,
          isFloater: person.isFloater,
          overtimeHoursYtd: Math.round(rand(`${person.id}:ytd`) * 120),
        }))
      const locationNames = new Map(
        db.locations
          .findMany((item) => item.tenantId === tenantId)
          .map((item) => [item.id, item.name])
      )
      const assignments = assignmentsBetween(
        tenantId,
        wideFrom,
        wideTo,
        (assignment) => rosterIds.has(assignment.personnelId)
      ).map((assignment) => serializeAssignment(assignment, locationNames))
      const leaves = db.leaves
        .findMany(
          (leave) =>
            leave.tenantId === tenantId &&
            rosterIds.has(leave.personnelId) &&
            (leave.status === "approved" || leave.status === "pending") &&
            leave.startDate <= wideTo &&
            leave.endDate >= wideFrom
        )
        .map((leave) => ({
          id: leave.id,
          personnelId: leave.personnelId,
          type: leave.type,
          typeLabel: LEAVE_TYPE_LABELS[leave.type],
          startDate: leave.startDate,
          endDate: leave.endDate,
          status: leave.status as "pending" | "approved",
        }))
      const response: LocationSchedule = {
        location: {
          id: location.id,
          code: location.code,
          name: location.name,
          targetHeadcount: location.targetHeadcount,
        },
        from: query.from,
        to: query.to,
        version: locationVersion(tenantId, location.id),
        roster,
        assignments,
        leaves,
        holidays: holidaysBetween(query.from, query.to),
      }
      return ok(response)
    })
  ),
  http.post(
    apiPath("/schedule/batch"),
    withAuth("schedule:write", async ({ request, auth }) => {
      const body = await parseBody(request, scheduleBatchSchema)
      if (!body.success) return body.response
      const tenantId = auth.tenant.slug
      const location = db.locations.findById(body.data.locationId)
      if (!location || !createScope(auth).location(location)) return notFound()
      const current = locationVersion(tenantId, location.id)
      if (!body.data.force && body.data.version !== current) {
        return problem(
          409,
          "VERSION_CONFLICT",
          "Plan siz düzenlerken başka bir kullanıcı tarafından değiştirildi."
        )
      }
      const dates = body.data.changes.map((change) => change.date).sort()
      ensureRange(
        tenantId,
        addDaysIso(dates[0]!, -1),
        addDaysIso(dates.at(-1)!, 1)
      )
      const templates = new Map(
        db.shiftTemplates
          .findMany((template) => template.tenantId === tenantId)
          .map((template) => [template.id, template])
      )
      const people = new Map(
        db.personnel
          .findMany((person) => person.tenantId === tenantId)
          .map((person) => [person.id, person])
      )

      // Önce doğrula: kesin kurallar (onaylı izin, başka lokasyonla çakışma) backend'dedir
      const planned: {
        change: (typeof body.data.changes)[number]
        next: MockShiftAssignment | null
      }[] = []
      for (const change of body.data.changes) {
        const person = people.get(change.personnelId)
        if (!person)
          return problem(422, "UNKNOWN_PERSONNEL", "Personel bulunamadı.")
        if (change.templateId === null) {
          planned.push({ change, next: null })
          continue
        }
        const template = templates.get(change.templateId)
        if (!template || !template.isActive || template.kind === "rotation") {
          return problem(422, "INVALID_TEMPLATE", "Geçersiz vardiya şablonu.")
        }
        const leave = approvedLeaveOn(tenantId, person.id, change.date)
        if (leave) {
          return problem(
            422,
            "ON_LEAVE",
            `${person.firstName} ${person.lastName} ${change.date} tarihinde izinli; vardiya atanamaz.`
          )
        }
        planned.push({
          change,
          next: buildAssignment({
            id: `sh-${person.id}-${change.date}-${location.id}`,
            tenantId,
            personnelId: person.id,
            locationId: location.id,
            date: change.date,
            template,
          }),
        })
      }
      for (const { next } of planned) {
        if (!next) continue
        const clash = assignmentsBetween(
          tenantId,
          addDaysIso(next.date, -1),
          addDaysIso(next.date, 1),
          (other) =>
            other.personnelId === next.personnelId &&
            other.locationId !== location.id &&
            overlaps(other, next)
        )[0]
        if (clash) {
          const person = people.get(next.personnelId)!
          return problem(
            422,
            "OVERLAP",
            `${person.firstName} ${person.lastName} için ${clash.date} tarihinde başka bir lokasyonda çakışan vardiya var.`
          )
        }
      }

      for (const { change, next } of planned) {
        for (const existing of assignmentsBetween(
          tenantId,
          change.date,
          change.date,
          (item) =>
            item.personnelId === change.personnelId &&
            item.locationId === location.id &&
            item.kind === "regular"
        )) {
          removeAssignment(existing.id)
        }
        if (next) {
          addAssignment(next)
          ops.events.set(next.id, [])
        }
      }
      const version = bumpLocationVersion(tenantId, location.id)
      audit(auth, {
        action: "Vardiya planı kaydedildi",
        targetType: "schedule",
        targetLabel: location.name,
        details: `${body.data.changes.length} değişiklik${body.data.force ? " (üzerine yazıldı)" : ""}`,
      })
      return ok({
        version,
        applied: body.data.changes.length,
        at: mockClock.now().toISOString(),
      })
    })
  ),
  http.get(
    apiPath("/personnel/:id/shifts"),
    withAuth("schedule:read", ({ request, params, auth }) => {
      const person = db.personnel.findById(String(params.id))
      if (!person || !createScope(auth).personnel(person)) return notFound()
      const query = parseQuery(
        request,
        z.object({ from: z.iso.date(), to: z.iso.date() })
      )
      if (!isoDateRangeValid(query.from, query.to, 62)) {
        return problem(
          400,
          "INVALID_RANGE",
          "Tarih aralığı en fazla 62 gün olabilir."
        )
      }
      const locationNames = new Map(
        db.locations
          .findMany((item) => item.tenantId === auth.tenant.slug)
          .map((item) => [item.id, item.name])
      )
      const items = assignmentsBetween(
        auth.tenant.slug,
        query.from,
        query.to,
        (assignment) => assignment.personnelId === person.id
      ).map((assignment) => serializeAssignment(assignment, locationNames))
      return ok({ items })
    })
  ),
  http.get(
    apiPath("/holidays"),
    withAuth(null, ({ request }) => {
      const { year } = parseQuery(
        request,
        z.object({ year: z.coerce.number().int().min(2000).max(2100) })
      )
      return ok({ items: holidaysBetween(`${year}-01-01`, `${year}-12-31`) })
    })
  ),
]
