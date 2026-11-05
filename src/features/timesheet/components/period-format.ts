import type { StatusTone } from "@/shared/components/status-badge"

import type { PeriodStatus } from "../model/timesheet"

export const PERIOD_STATUS_TONES: Record<PeriodStatus, StatusTone> = {
  open: "info",
  region_approved: "warning",
  customer_approved: "warning",
  hr_approved: "success",
  locked: "neutral",
}

/** "2026-09" → "Eylül 2026" */
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`))
