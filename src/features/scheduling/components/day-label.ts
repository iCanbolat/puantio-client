import { isoWeekday } from "@/shared/lib/work-time"

const WEEKDAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]

/** "2026-09-14" → "Pzt 14.09" */
export const dayLabel = (date: string) =>
  `${WEEKDAY_SHORT[isoWeekday(date) - 1] ?? ""} ${date.slice(8)}.${date.slice(5, 7)}`
