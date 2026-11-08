import { addMonths, monthOf } from "@/shared/lib/work-time"

/** "2026-09" → "Eylül 2026" */
export function monthTitle(month: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`))
}

/** Seçim kutusu için son `count` ay (en yeni önce) */
export function recentMonths(now: Date, count = 12): string[] {
  const current = monthOf(now)
  return Array.from({ length: count }, (_, index) => addMonths(current, -index))
}

export const previousMonth = (now: Date) => addMonths(monthOf(now), -1)
