import {
  addDaysIso,
  istanbulDateTime,
  monthRange,
} from "@/shared/lib/work-time"

import type { AuditFrequency, PlanState } from "../model/audit"

const STEP_DAYS: Record<Exclude<AuditFrequency, "monthly">, number> = {
  weekly: 7,
  biweekly: 14,
}

/**
 * Ay içindeki denetim yuvaları: her yuva bir tarih aralığıdır ve aralık içinde en az bir
 * denetim beklenir. Haftalık/2 haftalık yuvalar planın başlangıç tarihinden itibaren sayılır
 * ve ayın sonunda kesilir; aylık planda ayın tamamı tek yuvadır. Başlangıçtan önceki günler
 * yuva sayılmaz.
 */
export function planSlots(
  frequency: AuditFrequency,
  startDate: string,
  month: string
): { from: string; to: string }[] {
  const range = monthRange(month)
  if (startDate > range.to) return []
  const first = startDate > range.from ? startDate : range.from
  if (frequency === "monthly") return [{ from: first, to: range.to }]
  const step = STEP_DAYS[frequency]
  // Ayın içindeki ilk yuva başlangıcını, plan başlangıcının ritmine hizala
  let cursor = startDate
  while (addDaysIso(cursor, step) <= first) cursor = addDaysIso(cursor, step)
  const slots: { from: string; to: string }[] = []
  for (; cursor <= range.to; cursor = addDaysIso(cursor, step)) {
    const end = addDaysIso(cursor, step - 1)
    const from = cursor < first ? first : cursor
    slots.push({ from, to: end > range.to ? range.to : end })
  }
  return slots
}

/**
 * Planlanan / gerçekleşen karşılaştırması. Denetim tarihleri ("YYYY-MM-DD") yuvalara düşer;
 * bir yuvada birden fazla denetim yapılsa da bir kez sayılır. Bitmiş ama denetimsiz yuvalar
 * "eksik" sayılır.
 */
export function planCompliance(
  slots: readonly { from: string; to: string }[],
  auditDates: readonly string[],
  now: Date
): { planned: number; done: number; missing: number; state: PlanState } {
  let done = 0
  let missing = 0
  for (const slot of slots) {
    const covered = auditDates.some(
      (date) => date >= slot.from && date <= slot.to
    )
    if (covered) done += 1
    else if (istanbulDateTime(addDaysIso(slot.to, 1)) <= now) missing += 1
  }
  const planned = slots.length
  const state: PlanState =
    done >= planned ? "complete" : missing > 0 ? "late" : "on_track"
  return { planned, done, missing, state }
}
