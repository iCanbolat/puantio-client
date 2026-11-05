import type { MockAttendanceEvent, MockShiftAssignment } from "../db/types"

/**
 * Faz 2 mock çalışma zamanı durumu. Vardiya atamaları ve giriş/çıkış kayıtları her kiracı
 * için hafta hafta, ilk ihtiyaç anında deterministik olarak üretilir (saat dev panelinden
 * hangi güne taşınırsa taşınsın veri vardır). Bellek içi indeksler büyük veri setinde
 * (Atlas: 6.000 personel) `Collection` kopyalama maliyetinden kaçınmak içindir.
 */
export interface OperationsFlags {
  /** Rastgele geç kalma, gelmeme ve anomaliler */
  noise: boolean
  /** Rastgele eksik çıkış (`?` kodu) */
  missingCheckouts: boolean
  /** Her gün 07:00 vardiyasına gelmeyecek personel (morning-no-show) */
  noShowPersonnelIds: Set<string>
  /** Bodrum kattan saatler sonra senkronize olan kayıtlar (offline-sync-burst) */
  offlineBurstPersonnelIds: Set<string>
  /** Geofence dışı giriş yapan personel ve mesafeleri */
  geofenceViolations: Map<string, number>
  /** Geçen ay dönemleri kilitli başlar (period-locked) */
  lockPreviousMonth: boolean
  /** Geçen ay dönemleri İK onaylı başlar (month-end-close akışı bölge onayından başlar) */
  previousMonthStatus: "open" | "locked"
  /** Realtime bağlantıları kabul edilmez (WS koparma simülasyonu) */
  realtimeBlocked: boolean
}

export const defaultFlags = (): OperationsFlags => ({
  noise: true,
  missingCheckouts: true,
  noShowPersonnelIds: new Set(),
  offlineBurstPersonnelIds: new Set(),
  geofenceViolations: new Map(),
  lockPreviousMonth: false,
  previousMonthStatus: "open",
  realtimeBlocked: false,
})

export const ops = {
  flags: defaultFlags(),
  /** tenantId → üretilmiş haftalar (pazartesi) */
  weeks: new Map<string, Set<string>>(),
  /** tenantId → izin üretilmiş haftalar */
  leaveWeeks: new Map<string, Set<string>>(),
  /** tenantId → tarih → atamalar */
  byDate: new Map<string, Map<string, MockShiftAssignment[]>>(),
  byId: new Map<string, MockShiftAssignment>(),
  /** shiftId → giriş/çıkış kayıtları */
  events: new Map<string, MockAttendanceEvent[]>(),
  /** `${tenantId}|${locationId}` → plan sürümü (iyimser kilit) */
  versions: new Map<string, number>(),
  /** Bekleyen izin talepleri üretilen kiracılar */
  pendingLeavesSeeded: new Set<string>(),
}

export function resetOperations(): void {
  ops.flags = defaultFlags()
  ops.weeks.clear()
  ops.leaveWeeks.clear()
  ops.byDate.clear()
  ops.byId.clear()
  ops.events.clear()
  ops.versions.clear()
  ops.pendingLeavesSeeded.clear()
}

export function tenantDays(tenantId: string) {
  let map = ops.byDate.get(tenantId)
  if (!map) {
    map = new Map()
    ops.byDate.set(tenantId, map)
  }
  return map
}

export function addAssignment(assignment: MockShiftAssignment): void {
  const days = tenantDays(assignment.tenantId)
  const list = days.get(assignment.date)
  if (list) list.push(assignment)
  else days.set(assignment.date, [assignment])
  ops.byId.set(assignment.id, assignment)
}

export function removeAssignment(id: string): MockShiftAssignment | null {
  const assignment = ops.byId.get(id)
  if (!assignment) return null
  ops.byId.delete(id)
  ops.events.delete(id)
  const list = tenantDays(assignment.tenantId).get(assignment.date)
  if (list) {
    const index = list.findIndex((item) => item.id === id)
    if (index >= 0) list.splice(index, 1)
  }
  return assignment
}

export function locationVersion(tenantId: string, locationId: string): number {
  return ops.versions.get(`${tenantId}|${locationId}`) ?? 0
}

export function bumpLocationVersion(
  tenantId: string,
  locationId: string
): number {
  const next = locationVersion(tenantId, locationId) + 1
  ops.versions.set(`${tenantId}|${locationId}`, next)
  return next
}
