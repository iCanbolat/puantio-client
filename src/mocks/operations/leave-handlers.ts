import { http } from "msw"

import {
  LEAVE_TYPE_LABELS,
  annualLeaveEntitlement,
  leaveDecisionSchema,
  leaveInputSchema,
  leaveListParamsSchema,
  seniorityYears,
  type Leave,
} from "@/entities/leave"
import { descendantIds } from "@/entities/org-unit"
import { toIsoDate } from "@/shared/lib/date"
import { includesTr } from "@/shared/lib/format"
import { addDaysIso, monthRange } from "@/shared/lib/work-time"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockLeave, MockPersonnel } from "../db/types"
import {
  apiPath,
  created,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import { resolveAlarm } from "./attendance"
import { paginate } from "./common"
import {
  assignmentsBetween,
  countLeaveDays,
  ensureLeaves,
  ensurePendingLeaves,
} from "./plan"
import { bumpLocationVersion, removeAssignment } from "./store"

function serializeLeave(
  leave: MockLeave,
  people: Map<string, MockPersonnel>,
  locationNames: Map<string, string>
): Leave {
  const person = people.get(leave.personnelId)
  return {
    id: leave.id as Leave["id"],
    personnelId: leave.personnelId,
    personnelName: person ? `${person.firstName} ${person.lastName}` : "—",
    employeeNumber: person?.employeeNumber ?? "—",
    locationName: person?.homeLocationId
      ? (locationNames.get(person.homeLocationId) ?? null)
      : person?.isFloater
        ? "Yedek havuzu"
        : null,
    type: leave.type,
    startDate: leave.startDate,
    endDate: leave.endDate,
    days: leave.days,
    status: leave.status,
    note: leave.type === "sick_report" ? null : leave.note,
    requestedAt: leave.requestedAt,
    requestedBy: leave.requestedBy,
    decidedAt: leave.decidedAt,
    decidedBy: leave.decidedBy,
    decisionNote: leave.decisionNote,
  }
}

function lookups(tenantId: string) {
  return {
    people: new Map(
      db.personnel
        .findMany((person) => person.tenantId === tenantId)
        .map((person) => [person.id, person])
    ),
    locationNames: new Map(
      db.locations
        .findMany((location) => location.tenantId === tenantId)
        .map((location) => [location.id, location.name])
    ),
  }
}

function prepare(auth: AuthContext) {
  const today = toIsoDate(mockClock.now())
  ensureLeaves(auth.tenant.slug, addDaysIso(today, -56), addDaysIso(today, 35))
  ensurePendingLeaves(auth.tenant.slug, today)
}

export function leaveBalance(
  tenantId: string,
  person: MockPersonnel,
  today: string
) {
  const year = Number(today.slice(0, 4))
  const seniority = seniorityYears(person.hireDate, today)
  const entitlement = annualLeaveEntitlement(seniority)
  const annual = db.leaves.findMany(
    (leave) =>
      leave.tenantId === tenantId &&
      leave.personnelId === person.id &&
      leave.type === "annual" &&
      leave.startDate.startsWith(String(year))
  )
  const sum = (status: MockLeave["status"]) =>
    annual
      .filter((leave) => leave.status === status)
      .reduce((total, leave) => total + leave.days, 0)
  const used = sum("approved")
  const pending = sum("pending")
  return {
    personnelId: person.id,
    year,
    entitlement,
    used,
    pending,
    remaining: entitlement - used - pending,
    seniorityYears: seniority,
  }
}

export const leaveHandlers = [
  http.get(
    apiPath("/leaves"),
    withAuth("leave:read", ({ request, auth }) => {
      prepare(auth)
      const params = parseQuery(request, leaveListParamsSchema)
      const tenantId = auth.tenant.slug
      const scope = createScope(auth)
      const { people, locationNames } = lookups(tenantId)
      let units: Set<string> | null = null
      if (params.orgUnitId) {
        units = descendantIds(
          db.orgUnits.findMany((unit) => unit.tenantId === tenantId),
          params.orgUnitId
        )
      }
      const locationUnits = new Map(
        db.locations
          .findMany((location) => location.tenantId === tenantId)
          .map((location) => [location.id, location.orgUnitId])
      )
      const month = params.month ? monthRange(params.month) : null
      const items = db.leaves
        .findMany((leave) => {
          if (leave.tenantId !== tenantId) return false
          const person = people.get(leave.personnelId)
          if (!person || !scope.personnel(person)) return false
          if (params.status && leave.status !== params.status) return false
          if (params.type && leave.type !== params.type) return false
          if (params.personnelId && leave.personnelId !== params.personnelId)
            return false
          if (
            month &&
            (leave.startDate > month.to || leave.endDate < month.from)
          )
            return false
          if (units) {
            const unit = person.homeLocationId
              ? locationUnits.get(person.homeLocationId)
              : undefined
            if (!unit || !units.has(unit)) return false
          }
          if (
            params.q &&
            !includesTr(
              `${person.firstName} ${person.lastName} ${person.employeeNumber}`,
              params.q
            )
          )
            return false
          return true
        })
        .sort((a, b) => {
          // Onay bekleyenler önce, sonra yeni tarihli
          if (a.status === "pending" && b.status !== "pending") return -1
          if (b.status === "pending" && a.status !== "pending") return 1
          return b.startDate.localeCompare(a.startDate)
        })
        .map((leave) => serializeLeave(leave, people, locationNames))
      return ok(paginate(items, params.page, params.pageSize))
    })
  ),
  http.post(
    apiPath("/leaves"),
    withAuth("leave:request", async ({ request, auth }) => {
      const body = await parseBody(request, leaveInputSchema)
      if (!body.success) return body.response
      prepare(auth)
      const tenantId = auth.tenant.slug
      const person = db.personnel.findById(body.data.personnelId)
      if (!person || !createScope(auth).personnel(person)) {
        return problem(422, "VALIDATION_FAILED", "Personel bulunamadı.", {
          personnelId: ["Personel bulunamadı veya yetkiniz dışında."],
        })
      }
      const overlapping = db.leaves.findFirst(
        (leave) =>
          leave.tenantId === tenantId &&
          leave.personnelId === person.id &&
          (leave.status === "pending" || leave.status === "approved") &&
          leave.startDate <= body.data.endDate &&
          leave.endDate >= body.data.startDate
      )
      if (overlapping) {
        return problem(422, "VALIDATION_FAILED", "Çakışan izin kaydı var.", {
          startDate: [
            `Bu tarihlerde ${LEAVE_TYPE_LABELS[overlapping.type].toLocaleLowerCase("tr")} kaydı var (${overlapping.startDate} – ${overlapping.endDate}).`,
          ],
        })
      }
      const days = countLeaveDays(body.data.startDate, body.data.endDate)
      if (body.data.type === "annual") {
        const balance = leaveBalance(
          tenantId,
          person,
          toIsoDate(mockClock.now())
        )
        if (days > balance.remaining) {
          return problem(
            422,
            "VALIDATION_FAILED",
            "Yıllık izin bakiyesi yetersiz.",
            {
              endDate: [
                `Yıllık izin bakiyesi yetersiz: kalan ${balance.remaining} gün, talep ${days} gün.`,
              ],
            }
          )
        }
      }
      const leave = db.leaves.insert({
        id: newId("lv"),
        tenantId,
        personnelId: person.id,
        type: body.data.type,
        startDate: body.data.startDate,
        endDate: body.data.endDate,
        days,
        status: "pending",
        note: body.data.note ?? null,
        requestedAt: mockClock.now().toISOString(),
        requestedBy: auth.actorName,
        decidedAt: null,
        decidedBy: null,
        decisionNote: null,
      })
      audit(auth, {
        action: "İzin talebi girildi",
        targetType: "leave",
        targetLabel: `${person.firstName} ${person.lastName}`,
        details: `${LEAVE_TYPE_LABELS[leave.type]} · ${leave.startDate} – ${leave.endDate}`,
      })
      const { people, locationNames } = lookups(tenantId)
      return created(serializeLeave(leave, people, locationNames))
    })
  ),
  http.post(
    apiPath("/leaves/:id/decision"),
    withAuth("leave:approve", async ({ request, params, auth }) => {
      const leave = db.leaves.findById(String(params.id))
      const tenantId = auth.tenant.slug
      const person = leave
        ? db.personnel.findById(leave.personnelId)
        : undefined
      if (
        !leave ||
        leave.tenantId !== tenantId ||
        !person ||
        !createScope(auth).personnel(person)
      )
        return notFound()
      const body = await parseBody(request, leaveDecisionSchema)
      if (!body.success) return body.response
      if (leave.status !== "pending") {
        return problem(409, "LEAVE_DECIDED", "Bu talep zaten sonuçlandırılmış.")
      }
      if (body.data.decision === "reject" && !body.data.note) {
        return problem(422, "VALIDATION_FAILED", "Ret gerekçesi zorunlu.", {
          note: ["Ret gerekçesini yazın."],
        })
      }
      const now = mockClock.now()
      let removedShifts = 0
      if (body.data.decision === "approve") {
        const affected = assignmentsBetween(
          tenantId,
          leave.startDate,
          leave.endDate,
          (assignment) =>
            assignment.personnelId === leave.personnelId &&
            assignment.kind === "regular"
        )
        const locations = new Set<string>()
        for (const assignment of affected) {
          removeAssignment(assignment.id)
          locations.add(assignment.locationId)
          removedShifts += 1
          const alarm = db.alarms.findFirst(
            (item) =>
              item.shiftId === assignment.id && item.status !== "resolved"
          )
          if (alarm) {
            resolveAlarm(
              alarm,
              {
                reason: "on_leave",
                note: "İzin onaylandı.",
                backupPersonnelId: null,
              },
              auth.actorName,
              now
            )
          }
        }
        for (const locationId of locations)
          bumpLocationVersion(tenantId, locationId)
      }
      const updated = db.leaves.update(leave.id, {
        status: body.data.decision === "approve" ? "approved" : "rejected",
        decidedAt: now.toISOString(),
        decidedBy: auth.actorName,
        decisionNote: body.data.note ?? null,
      })!
      audit(auth, {
        action:
          body.data.decision === "approve"
            ? "İzin onaylandı"
            : "İzin reddedildi",
        targetType: "leave",
        targetLabel: `${person.firstName} ${person.lastName}`,
        details: `${LEAVE_TYPE_LABELS[leave.type]} · ${leave.startDate} – ${leave.endDate}${removedShifts > 0 ? ` · ${removedShifts} vardiya kaldırıldı` : ""}`,
      })
      const { people, locationNames } = lookups(tenantId)
      return ok({
        leave: serializeLeave(updated, people, locationNames),
        removedShifts,
      })
    })
  ),
  http.post(
    apiPath("/leaves/:id/cancel"),
    withAuth("leave:request", ({ params, auth }) => {
      const leave = db.leaves.findById(String(params.id))
      if (!leave || leave.tenantId !== auth.tenant.slug) return notFound()
      if (leave.status !== "pending") {
        return problem(
          409,
          "LEAVE_DECIDED",
          "Yalnızca onay bekleyen talep iptal edilebilir."
        )
      }
      const updated = db.leaves.update(leave.id, {
        status: "cancelled",
        decidedAt: mockClock.now().toISOString(),
        decidedBy: auth.actorName,
      })!
      const { people, locationNames } = lookups(auth.tenant.slug)
      return ok(serializeLeave(updated, people, locationNames))
    })
  ),
  http.get(
    apiPath("/personnel/:id/leave-balance"),
    withAuth("leave:read", ({ params, auth }) => {
      prepare(auth)
      const person = db.personnel.findById(String(params.id))
      if (!person || !createScope(auth).personnel(person)) return notFound()
      return ok(
        leaveBalance(auth.tenant.slug, person, toIsoDate(mockClock.now()))
      )
    })
  ),
]
