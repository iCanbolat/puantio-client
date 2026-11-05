import { formatDuration } from "@/shared/lib/format"
import { HOUR_MS, MINUTE_MS } from "@/shared/lib/work-time"

import type { Anomaly } from "../model/attendance"

export interface AnomalyEvent {
  kind: "in" | "out"
  deviceTime: Date
  receivedAt: Date
  offline: boolean
  inside: boolean
  distanceMeters: number
}

/** Cihaz saati ile sunucu saati arasında bu farktan büyüğü sapmadır (çevrimiçi kayıtta) */
export const CLOCK_SKEW_MS = 5 * MINUTE_MS
/** Offline kuyruktan bu süreden geç ulaşan kayıt "geç senkron"dur */
export const LATE_SYNC_MS = 30 * MINUTE_MS
/** Vardiya bitiminden bu süre sonra çıkış yoksa "eksik çıkış" */
export const MISSING_CHECKOUT_GRACE_MS = 2 * HOUR_MS

const meters = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 })

export function detectAnomalies(input: {
  endsAt: Date
  events: readonly AnomalyEvent[]
  now: Date
}): Anomaly[] {
  const anomalies: Anomaly[] = []
  const outside = input.events.filter((event) => !event.inside)
  if (outside.length > 0) {
    const farthest = Math.max(...outside.map((event) => event.distanceMeters))
    anomalies.push({
      code: "outside_geofence",
      detail: `${meters.format(farthest)} m`,
    })
  }
  const checkIns = input.events.filter((event) => event.kind === "in")
  const hasCheckOut = input.events.some((event) => event.kind === "out")
  if (
    checkIns.length > 0 &&
    !hasCheckOut &&
    input.now.getTime() > input.endsAt.getTime() + MISSING_CHECKOUT_GRACE_MS
  ) {
    anomalies.push({ code: "missing_checkout", detail: null })
  }
  if (checkIns.length > 1) {
    anomalies.push({
      code: "duplicate_checkin",
      detail: `${checkIns.length} giriş`,
    })
  }
  const skewed = input.events.find(
    (event) =>
      !event.offline &&
      Math.abs(event.receivedAt.getTime() - event.deviceTime.getTime()) >
        CLOCK_SKEW_MS
  )
  if (skewed) {
    const diff = skewed.deviceTime.getTime() - skewed.receivedAt.getTime()
    anomalies.push({
      code: "clock_skew",
      detail: `${formatDuration(Math.abs(diff))} ${diff > 0 ? "ileri" : "geri"}`,
    })
  }
  const lateSync = input.events
    .filter((event) => event.offline)
    .map((event) => event.receivedAt.getTime() - event.deviceTime.getTime())
    .filter((delay) => delay > LATE_SYNC_MS)
  if (lateSync.length > 0) {
    anomalies.push({
      code: "late_sync",
      detail: `${formatDuration(Math.max(...lateSync))} sonra ulaştı`,
    })
  }
  return anomalies
}
