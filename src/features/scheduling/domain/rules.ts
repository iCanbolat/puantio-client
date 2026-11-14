import {
  evaluateRequirements,
  requirementMessage,
  type ScheduleCompliance,
} from "@/entities/ohs"
import type { LaborRules } from "@/entities/tenant"
import {
  HOUR_MS,
  MINUTE_MS,
  addDaysIso,
  startOfIsoWeek,
  istanbulDateTime,
} from "@/shared/lib/work-time"

/**
 * Vardiya kural motoru (4857 sayılı İş Kanunu). Panoda **uyarı** üretir; kesin kararı backend
 * verir. `block` seviyesindeki ihlaller (çakışma, onaylı izin) kaydı engeller.
 */

export interface RuleShift {
  /** Panoda hücre anahtarı da olabilir (taslak atamalar) */
  id: string
  personnelId: string
  date: string
  startsAt: number
  endsAt: number
  breakMinutes: number
}

export interface RuleLeave {
  personnelId: string
  startDate: string
  endDate: string
  status: "pending" | "approved"
  typeLabel: string
}

export const RULE_CODES = [
  "overlap",
  "on_leave",
  "pending_leave",
  "daily_limit",
  "weekly_limit",
  "rest_period",
  "weekly_rest",
  "annual_overtime",
  "certificate_missing",
  "certificate_expired",
  "certificate_expiring",
] as const
export type RuleCode = (typeof RULE_CODES)[number]

export interface RuleViolation {
  code: RuleCode
  severity: "block" | "warn"
  personnelId: string
  /** İhlale konu atamalar (rozet bu hücrelerde görünür) */
  shiftIds: string[]
  message: string
}

const netHours = (shift: RuleShift) =>
  Math.max(0, shift.endsAt - shift.startsAt - shift.breakMinutes * MINUTE_MS) /
  HOUR_MS

const fmtHours = (value: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)

function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const id = key(item)
    const list = groups.get(id)
    if (list) list.push(item)
    else groups.set(id, [item])
  }
  return groups
}

export interface EvaluateOptions {
  rules: LaborRules
  /** Yıl başından bu yana fazla mesai (saat), personel bazında */
  overtimeHoursYtd?: ReadonlyMap<string, number>
}

/** Bir personelin atamaları üzerinde tüm kuralları çalıştırır. */
function evaluatePerson(
  personnelId: string,
  shifts: RuleShift[],
  leaves: readonly RuleLeave[],
  options: EvaluateOptions
): RuleViolation[] {
  const { rules } = options
  const violations: RuleViolation[] = []
  const sorted = [...shifts].sort((a, b) => a.startsAt - b.startsAt)

  // 1. Çakışan vardiya
  sorted.forEach((current, i) => {
    for (const next of sorted.slice(i + 1)) {
      if (next.startsAt >= current.endsAt) break
      violations.push({
        code: "overlap",
        severity: "block",
        personnelId,
        shiftIds: [current.id, next.id],
        message: `Çakışan vardiya: ${current.date} ve ${next.date} atamaları aynı saatlere denk geliyor.`,
      })
    }
  })

  // 2. İzin / rapor
  for (const shift of sorted) {
    for (const leave of leaves) {
      if (shift.date < leave.startDate || shift.date > leave.endDate) continue
      violations.push(
        leave.status === "approved"
          ? {
              code: "on_leave",
              severity: "block",
              personnelId,
              shiftIds: [shift.id],
              message: `${shift.date} tarihinde onaylı ${leave.typeLabel.toLocaleLowerCase("tr")} var; vardiya atanamaz.`,
            }
          : {
              code: "pending_leave",
              severity: "warn",
              personnelId,
              shiftIds: [shift.id],
              message: `${shift.date} için onay bekleyen ${leave.typeLabel.toLocaleLowerCase("tr")} talebi var.`,
            }
      )
    }
  }

  // 3. Günlük üst sınır
  for (const [date, dayShifts] of groupBy(sorted, (shift) => shift.date)) {
    const total = dayShifts.reduce((sum, shift) => sum + netHours(shift), 0)
    if (total > rules.dailyHours) {
      violations.push({
        code: "daily_limit",
        severity: "warn",
        personnelId,
        shiftIds: dayShifts.map((shift) => shift.id),
        message: `${date}: günlük çalışma ${fmtHours(total)} saat (üst sınır ${rules.dailyHours} saat).`,
      })
    }
  }

  // 4. Haftalık üst sınır ve 7. Hafta tatili (Pazartesi–Pazar)
  const weekly = groupBy(sorted, (shift) => startOfIsoWeek(shift.date))
  let weeklyOvertime = 0
  for (const [weekStart, weekShifts] of weekly) {
    const total = weekShifts.reduce((sum, shift) => sum + netHours(shift), 0)
    if (total > rules.weeklyHours) {
      weeklyOvertime += total - rules.weeklyHours
      violations.push({
        code: "weekly_limit",
        severity: "warn",
        personnelId,
        shiftIds: weekShifts.map((shift) => shift.id),
        message: `${weekStart} haftası: ${fmtHours(total)} saat planlandı; haftalık ${rules.weeklyHours} saati ${fmtHours(total - rules.weeklyHours)} saat aşıyor (fazla mesai).`,
      })
    }
    const weekBegin = istanbulDateTime(weekStart).getTime()
    const weekEnd = istanbulDateTime(addDaysIso(weekStart, 7)).getTime()
    let cursor = weekBegin
    let longestGap = 0
    for (const shift of weekShifts) {
      longestGap = Math.max(longestGap, shift.startsAt - cursor)
      cursor = Math.max(cursor, shift.endsAt)
    }
    longestGap = Math.max(longestGap, weekEnd - cursor)
    if (weekShifts.length > 0 && longestGap < rules.weeklyRestHours * HOUR_MS) {
      violations.push({
        code: "weekly_rest",
        severity: "warn",
        personnelId,
        shiftIds: weekShifts.map((shift) => shift.id),
        message: `${weekStart} haftasında kesintisiz ${rules.weeklyRestHours} saatlik hafta tatili yok.`,
      })
    }
  }

  // 5. Vardiyalar arası dinlenme
  sorted.slice(1).forEach((current, index) => {
    const previous = sorted[index]
    if (!previous) return
    const gap = current.startsAt - previous.endsAt
    if (gap >= 0 && gap < rules.minRestHours * HOUR_MS) {
      violations.push({
        code: "rest_period",
        severity: "warn",
        personnelId,
        shiftIds: [previous.id, current.id],
        message: `Dinlenme süresi ${fmtHours(gap / HOUR_MS)} saat: iki vardiya arasında en az ${rules.minRestHours} saat olmalı.`,
      })
    }
  })

  // 6. Yıllık fazla mesai sınırı
  const ytd = options.overtimeHoursYtd?.get(personnelId) ?? 0
  if (weeklyOvertime > 0 && ytd + weeklyOvertime > rules.annualOvertimeHours) {
    violations.push({
      code: "annual_overtime",
      severity: "warn",
      personnelId,
      shiftIds: sorted.map((shift) => shift.id),
      message: `Yıllık fazla mesai ${fmtHours(ytd + weeklyOvertime)} saate çıkıyor (sınır ${rules.annualOvertimeHours} saat).`,
    })
  }
  return violations
}

export function evaluateSchedule(
  shifts: readonly RuleShift[],
  leaves: readonly RuleLeave[],
  options: EvaluateOptions
): RuleViolation[] {
  const byPerson = groupBy(shifts, (shift) => shift.personnelId)
  const leavesByPerson = groupBy(leaves, (leave) => leave.personnelId)
  const violations: RuleViolation[] = []
  for (const [personnelId, personShifts] of byPerson) {
    violations.push(
      ...evaluatePerson(
        personnelId,
        personShifts,
        leavesByPerson.get(personnelId) ?? [],
        options
      )
    )
  }
  return violations
}

export const hasBlockingViolation = (violations: readonly RuleViolation[]) =>
  violations.some((violation) => violation.severity === "block")

/** Hücre bazında ihlal haritası (rozetler için) */
export function violationsByShift(
  violations: readonly RuleViolation[]
): Map<string, RuleViolation[]> {
  const map = new Map<string, RuleViolation[]>()
  for (const violation of violations) {
    for (const id of violation.shiftIds) {
      const list = map.get(id)
      if (list) list.push(violation)
      else map.set(id, [violation])
    }
  }
  return map
}

export interface CertificateCheckOptions {
  policy: "block" | "warn"
  warnDays: number
  /** Taslak (kaydedilecek) atama mı? Engel yalnızca taslaklarda uygulanır. */
  isDraft: (shift: RuleShift) => boolean
}

/**
 * Faz 6 lokasyon uygunluğu: gerekli sertifikası eksik veya vardiya gününde süresi dolmuş
 * personel. Kiracı politikası "engel" ise taslak atama kaydı engeller; kayıtlı atamalar ve
 * yakında dolacak sertifikalar uyarıdır. Kesin kontrol backend'dedir.
 */
export function evaluateCertificates(
  shifts: readonly RuleShift[],
  compliance: ScheduleCompliance,
  options: CertificateCheckOptions
): RuleViolation[] {
  if (compliance.requiredCertificates.length === 0) return []
  const byPerson = new Map(
    compliance.personnel.map((item) => [item.personnelId, item.certificates])
  )
  // Kişi × sertifika × durum × seviye başına tek ihlal; rozet ilgili tüm hücrelerde görünür
  const grouped = new Map<string, RuleViolation>()
  for (const shift of shifts) {
    const results = evaluateRequirements(
      compliance.requiredCertificates,
      byPerson.get(shift.personnelId) ?? [],
      shift.date,
      options.warnDays
    )
    for (const result of results) {
      if (result.state === "valid") continue
      const hard = result.state !== "expiring"
      const severity =
        hard && options.policy === "block" && options.isDraft(shift)
          ? "block"
          : "warn"
      const key = `${shift.personnelId}|${result.type}|${result.state}|${severity}`
      const existing = grouped.get(key)
      if (existing) {
        existing.shiftIds.push(shift.id)
        continue
      }
      grouped.set(key, {
        code:
          result.state === "missing"
            ? "certificate_missing"
            : result.state === "expired"
              ? "certificate_expired"
              : "certificate_expiring",
        severity,
        personnelId: shift.personnelId,
        shiftIds: [shift.id],
        message: requirementMessage(result),
      })
    }
  }
  const violations = [...grouped.values()]
  return violations
}
