import type {
  LocationSchedule,
  ShiftAssignment,
  ShiftTemplate,
} from "@/entities/shift"
import { MINUTE_MS, segmentInterval } from "@/shared/lib/work-time"

import type { RuleLeave, RuleShift } from "./rules"

/** Şablonun belirli gündeki aralığı (parçalı vardiyada ara mola sayılır) */
export function templateInterval(
  date: string,
  template: Pick<ShiftTemplate, "segments" | "breakMinutes">
): { startsAt: number; endsAt: number; breakMinutes: number } | null {
  const first = template.segments[0]
  const last = template.segments.at(-1)
  if (!first || !last) return null
  const start = segmentInterval(date, first)
  const end = segmentInterval(date, last)
  const gap =
    template.segments.length > 1
      ? Math.round((end.start.getTime() - start.end.getTime()) / MINUTE_MS)
      : 0
  return {
    startsAt: start.start.getTime(),
    endsAt: end.end.getTime(),
    breakMinutes: template.breakMinutes + gap,
  }
}

export interface BoardCell {
  personnelId: string
  date: string
  /** Hücrede gösterilen atama (taslak veya sunucu) */
  templateId: string | null
  code: string | null
  /** Başka lokasyondaki atama (bilgi amaçlı) */
  elsewhere: ShiftAssignment | null
  draft: boolean
  leave: { typeLabel: string; status: "pending" | "approved" } | null
  holiday: { name: string; kind: "full" | "half" } | null
}

export const cellShiftId = (personnelId: string, date: string) =>
  `cell:${personnelId}|${date}`

/**
 * Sunucu planı + taslak → pano hücreleri ve kural motoru girdisi. Bu lokasyondaki her
 * personel/gün için tek atama vardır; diğer lokasyonlardaki atamalar kurallara dahil edilir.
 */
export function buildBoard(
  schedule: LocationSchedule,
  days: readonly string[],
  drafts: Readonly<Record<string, string | null>>,
  templates: ReadonlyMap<string, ShiftTemplate>
): {
  cells: Map<string, BoardCell>
  ruleShifts: RuleShift[]
  ruleLeaves: RuleLeave[]
} {
  const locationId = schedule.location.id
  const here = new Map<string, ShiftAssignment>()
  const ruleShifts: RuleShift[] = []
  for (const assignment of schedule.assignments) {
    const key = `${assignment.personnelId}|${assignment.date}`
    if (assignment.locationId === locationId && assignment.kind === "regular") {
      here.set(key, assignment)
      if (key in drafts) continue
      ruleShifts.push({
        id: cellShiftId(assignment.personnelId, assignment.date),
        personnelId: assignment.personnelId,
        date: assignment.date,
        startsAt: Date.parse(assignment.startsAt),
        endsAt: Date.parse(assignment.endsAt),
        breakMinutes: assignment.breakMinutes,
      })
    } else {
      ruleShifts.push({
        id: assignment.id,
        personnelId: assignment.personnelId,
        date: assignment.date,
        startsAt: Date.parse(assignment.startsAt),
        endsAt: Date.parse(assignment.endsAt),
        breakMinutes: assignment.breakMinutes,
      })
    }
  }
  for (const [key, templateId] of Object.entries(drafts)) {
    if (!templateId) continue
    const template = templates.get(templateId)
    const [personnelId = "", date = ""] = key.split("|")
    const interval = template ? templateInterval(date, template) : null
    if (!interval) continue
    ruleShifts.push({
      id: cellShiftId(personnelId, date),
      personnelId,
      date,
      ...interval,
    })
  }

  const holidays = new Map(
    schedule.holidays.map((holiday) => [holiday.date, holiday])
  )
  const cells = new Map<string, BoardCell>()
  for (const member of schedule.roster) {
    for (const date of days) {
      const key = `${member.id}|${date}`
      const server = here.get(key) ?? null
      const draft = key in drafts
      const templateId = draft
        ? (drafts[key] ?? null)
        : (server?.templateId ?? null)
      const leave = schedule.leaves.find(
        (item) =>
          item.personnelId === member.id &&
          item.startDate <= date &&
          item.endDate >= date
      )
      const holiday = holidays.get(date)
      cells.set(key, {
        personnelId: member.id,
        date,
        templateId,
        code: draft
          ? templateId
            ? (templates.get(templateId)?.code ?? "?")
            : null
          : (server?.code ?? null),
        elsewhere:
          schedule.assignments.find(
            (item) =>
              item.personnelId === member.id &&
              item.date === date &&
              item.locationId !== locationId
          ) ?? null,
        draft,
        leave: leave
          ? { typeLabel: leave.typeLabel, status: leave.status }
          : null,
        holiday: holiday ? { name: holiday.name, kind: holiday.kind } : null,
      })
    }
  }
  return {
    cells,
    ruleShifts,
    ruleLeaves: schedule.leaves.map((leave) => ({
      personnelId: leave.personnelId,
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status,
      typeLabel: leave.typeLabel,
    })),
  }
}

/** Rotasyon şablonunu günlere yayar: başlangıç gününden itibaren adım adım */
export function expandRotation(
  template: Pick<ShiftTemplate, "rotation">,
  days: readonly string[],
  offset = 0
): Map<string, string | null> {
  const steps = template.rotation ?? []
  const result = new Map<string, string | null>()
  if (steps.length === 0) return result
  days.forEach((date, index) => {
    const step = steps[(index + offset) % steps.length]
    result.set(date, step?.kind === "shift" ? step.templateId : null)
  })
  return result
}
