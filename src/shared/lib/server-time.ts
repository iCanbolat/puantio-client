/**
 * Sunucu saati senkronu.
 *
 * Saha cihazlarının ve tarayıcıların saati sapabilir; SLA geri sayımları ve alarm eşikleri
 * sunucu saatine göre hesaplanmalıdır. Her API yanıtındaki `x-server-time` başlığı ile
 * yerel saat arasındaki fark (offset) tutulur. `serverNow()` bu farkı uygular.
 *
 * Mock modunda sunucu saati `mocks/clock.ts` tarafından yönetilir; böylece dev panelinden
 * saat 07:14'e alındığında tüm UI geri sayımları da bu saate göre çalışır.
 */
export const SERVER_TIME_HEADER = "x-server-time"

/** Offset bu değerden fazla değişirse dinleyiciler bilgilendirilir (ağ gecikmesi gürültüsü). */
const NOTIFY_THRESHOLD_MS = 1000

let offsetMs = 0
const listeners = new Set<() => void>()

export function syncServerTime(
  serverIso: string,
  receivedAt: number = Date.now()
): void {
  const serverMs = Date.parse(serverIso)
  if (Number.isNaN(serverMs)) return
  const next = serverMs - receivedAt
  const changed = Math.abs(next - offsetMs) > NOTIFY_THRESHOLD_MS
  offsetMs = next
  if (changed) listeners.forEach((listener) => listener())
}

export function serverNow(): Date {
  return new Date(Date.now() + offsetMs)
}

export function getServerTimeOffset(): number {
  return offsetMs
}

export function subscribeServerTime(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetServerTime(): void {
  offsetMs = 0
  listeners.forEach((listener) => listener())
}
