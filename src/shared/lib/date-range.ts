import { formatDate } from "./format"

/** Takvim günleri ISO biçiminde: `{ from: "2026-09-01", to: "2026-09-25" }` */
export interface IsoDateRange {
  from?: string | undefined
  to?: string | undefined
}

export function formatIsoRange(value: IsoDateRange): string | null {
  if (!value.from) return null
  const from = formatDate(`${value.from}T12:00:00+03:00`)
  if (!value.to || value.to === value.from) return from
  return `${from} – ${formatDate(`${value.to}T12:00:00+03:00`)}`
}
