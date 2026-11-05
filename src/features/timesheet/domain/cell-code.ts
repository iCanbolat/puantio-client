import type { LeaveType } from "@/entities/leave"
import {
  MINUTE_MS,
  isoWeekday,
  nightMinutes,
  roundToHalfHour,
} from "@/shared/lib/work-time"

import { LEAVE_CELL_CODES, type CellCode } from "../model/cell-code"

/** Gün kodu hesabının girdisi: o günün vardiyaları + giriş/çıkış + izin + tatil */
export interface DayCellInput {
  date: string
  now: Date
  /** O gün personel işveren tüzel kişilikte çalışıyor mu (giriş/çıkış tarihi) */
  employed: boolean
  holiday: { kind: "full" | "half" } | null
  /** Yalnızca onaylı izin */
  leaveType: LeaveType | null
  shifts: {
    startsAt: Date
    endsAt: Date
    breakMinutes: number
    checkIn: Date | null
    checkOut: Date | null
  }[]
  override?: { code: CellCode; overtimeHours: number } | null
}

export interface DayCell {
  /** `null`: henüz belirlenmedi (gelecek veya devam eden vardiya) */
  code: CellCode | null
  workedHours: number
  overtimeHours: number
  nightHours: number
  holidayWorkHours: number
  /** Pazar günü çalışma (hafta tatili mesaisi) */
  weeklyRestWorkHours: number
  /** Planlanandan eksik çalışılan süre (geç gelme / erken çıkma) */
  missingHours: number
}

const EMPTY: Omit<DayCell, "code"> = {
  workedHours: 0,
  overtimeHours: 0,
  nightHours: 0,
  holidayWorkHours: 0,
  weeklyRestWorkHours: 0,
  missingHours: 0,
}

/** Resmi tatilde bu izin türleri yerine "RT" yazılır (tatil izin gününden sayılmaz) */
const HOLIDAY_OVERRIDES_LEAVE: readonly LeaveType[] = [
  "annual",
  "excuse",
  "administrative",
]

const hours = (ms: number) => ms / (60 * MINUTE_MS)

/** Vardiya sonrası kısa kalışlar (devir, üst değişimi) fazla mesai sayılmaz */
export const OVERTIME_THRESHOLD_HOURS = 1

/** Bordro saatleri yarım saate aşağı yuvarlanır: 1,7 → 1,5 */
const floorToHalfHour = (value: number) => Math.floor(value * 2 + 1e-9) / 2

/**
 * Bir personelin bir günü için puantaj kodu. Öncelik: istihdam dışı → elle düzeltme →
 * izin/rapor (resmi tatil yıllık izni böler) → resmi tatil → arefe → vardiya sonucu.
 */
export function computeDayCell(input: DayCellInput): DayCell {
  if (!input.employed) return { code: "-", ...EMPTY }
  if (input.override) {
    return {
      code: input.override.code,
      ...EMPTY,
      overtimeHours: input.override.overtimeHours,
    }
  }

  const holiday = input.holiday
  if (input.leaveType) {
    const code =
      holiday?.kind === "full" &&
      HOLIDAY_OVERRIDES_LEAVE.includes(input.leaveType)
        ? "RT"
        : LEAVE_CELL_CODES[input.leaveType]
    return { code, ...EMPTY }
  }

  const now = input.now.getTime()
  let workedMs = 0
  let plannedMs = 0
  let night = 0
  let openShift = false
  let notStarted = false
  let missingCheckout = false
  let noShow = false
  for (const shift of input.shifts) {
    const breakMs = shift.breakMinutes * MINUTE_MS
    const planned = Math.max(
      0,
      shift.endsAt.getTime() - shift.startsAt.getTime() - breakMs
    )
    plannedMs += planned
    if (shift.checkIn && shift.checkOut) {
      // Vardiya başlangıcından önceki erken giriş çalışma sayılmaz
      const effectiveIn = Math.max(
        shift.checkIn.getTime(),
        shift.startsAt.getTime()
      )
      workedMs += Math.max(0, shift.checkOut.getTime() - effectiveIn - breakMs)
      night += nightMinutes(new Date(effectiveIn), shift.checkOut)
    } else if (shift.checkIn) {
      if (shift.endsAt.getTime() > now) openShift = true
      else missingCheckout = true
    } else if (shift.startsAt.getTime() > now) {
      notStarted = true
    } else {
      noShow = true
    }
  }

  const worked = hours(workedMs)
  const extra = worked - hours(plannedMs)
  const metrics: Omit<DayCell, "code"> = {
    workedHours: roundToHalfHour(worked),
    overtimeHours:
      extra >= OVERTIME_THRESHOLD_HOURS ? floorToHalfHour(extra) : 0,
    nightHours: roundToHalfHour(night / 60),
    holidayWorkHours: 0,
    weeklyRestWorkHours: 0,
    missingHours: 0,
  }

  if (holiday?.kind === "full") {
    return {
      code: "RT",
      ...EMPTY,
      nightHours: metrics.nightHours,
      holidayWorkHours: roundToHalfHour(worked),
    }
  }
  if (holiday?.kind === "half") {
    return { code: "YG", ...metrics }
  }
  if (input.shifts.length === 0) return { code: "HT", ...EMPTY }
  if (missingCheckout) return { code: "?", ...EMPTY }
  if (openShift || notStarted) return { code: null, ...EMPTY }
  if (noShow && workedMs === 0) return { code: "D", ...EMPTY }

  const missing = floorToHalfHour(Math.max(0, hours(plannedMs) - worked))
  return {
    code: metrics.overtimeHours > 0 ? "FM" : "N",
    ...metrics,
    weeklyRestWorkHours:
      isoWeekday(input.date) === 7 ? roundToHalfHour(worked) : 0,
    missingHours: missing >= 0.5 ? missing : 0,
  }
}

export interface TimesheetSummary {
  workedDays: number
  overtimeHours: number
  absenceDays: number
  leaveDays: number
  /** İstihdam edilen gün sayısı (bordro gün toplamı bu sayıya eşit olmalı) */
  expectedDays: number
  /** Kodu belirsiz (`?` / boş) gün sayısı */
  unresolvedDays: number
}

const LEAVE_SET = new Set<CellCode>(["Yİ", "R", "Üİ", "Mİ", "Dİ", "İİ"])

export function summarizeCells(
  cells: readonly Pick<DayCell, "code" | "overtimeHours">[]
): TimesheetSummary {
  const summary: TimesheetSummary = {
    workedDays: 0,
    overtimeHours: 0,
    absenceDays: 0,
    leaveDays: 0,
    expectedDays: 0,
    unresolvedDays: 0,
  }
  for (const cell of cells) {
    if (cell.code !== "-") summary.expectedDays += 1
    summary.overtimeHours += cell.overtimeHours
    if (cell.code === "N" || cell.code === "FM") summary.workedDays += 1
    else if (cell.code === "YG") summary.workedDays += 0.5
    else if (cell.code === "D") summary.absenceDays += 1
    else if (cell.code === null || cell.code === "?")
      summary.unresolvedDays += 1
    else if (LEAVE_SET.has(cell.code)) summary.leaveDays += 1
  }
  return summary
}
