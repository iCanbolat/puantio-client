import { db } from "../db"
import { ops } from "../operations/store"
import { setRealtimeBlocked } from "../realtime"
import { defineScenario } from "./types"

/**
 * Senaryo lokasyonu: kiracının ilk kök biriminin ilk lokasyonu. Bölge sorumlusu ve
 * süpervizör kapsamındadır (bkz. tenancy/users.ts), böylece her rol aynı olayları görür.
 */
export function scenarioLocationId(tenantId: string): string | null {
  const units = db.orgUnits.findMany((unit) => unit.tenantId === tenantId)
  const root = units.find((unit) => unit.level === 0)
  if (!root) return null
  const inRoot = new Set(
    units
      .filter((unit) => unit.id === root.id || unit.parentId === root.id)
      .map((unit) => unit.id)
  )
  return (
    db.locations.findFirst(
      (location) =>
        location.tenantId === tenantId && inRoot.has(location.orgUnitId)
    )?.id ?? null
  )
}

/**
 * Her kiracıda senaryo personelini senaryo lokasyonuna taşır. Bu kişiler her gün 07:00
 * sabah vardiyasındadır (izin üretilmez).
 */
export function assignScenarioPersonnel(
  count: number,
  offset = 0
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const tenant of db.tenants.findMany((item) => item.kind === "tenant")) {
    const locationId = scenarioLocationId(tenant.slug)
    if (!locationId) continue
    const people = db.personnel
      .findMany(
        (person) =>
          person.tenantId === tenant.slug &&
          person.status === "active" &&
          !person.isFloater &&
          person.terminationDate === null
      )
      .slice(offset, offset + count)
    for (const person of people) {
      db.personnel.update(person.id, { homeLocationId: locationId })
    }
    result.set(
      tenant.slug,
      people.map((person) => person.id)
    )
  }
  return result
}

const all = (map: Map<string, string[]>) => [...map.values()].flat()

export const phase2Scenarios = [
  defineScenario({
    id: "morning-no-show",
    label: "Sabah gelmeyen personel",
    description:
      "07:00 vardiyasına 3 kişi gelmez (diğer herkes zamanında). Saat 07:10'a alındığında 3 alarm düşer.",
    phase: 2,
    setup: () => {
      ops.flags.noise = false
      ops.flags.noShowPersonnelIds = new Set(all(assignScenarioPersonnel(3)))
    },
  }),
  defineScenario({
    id: "offline-sync-burst",
    label: "Offline senkron patlaması",
    description:
      "Bodrum kattaki 5 personelin 07:00 girişleri cihazda kalır, yaklaşık 3,5 saat sonra topluca ulaşır.",
    phase: 2,
    setup: () => {
      ops.flags.noise = false
      ops.flags.offlineBurstPersonnelIds = new Set(
        all(assignScenarioPersonnel(5))
      )
    },
  }),
  defineScenario({
    id: "geofence-violations",
    label: "Geofence ihlalleri",
    description:
      "3 personel lokasyon sınırının dışından giriş yapar (480, 220 ve 650 m).",
    phase: 2,
    setup: () => {
      ops.flags.noise = false
      const distances = [480, 220, 650]
      const violations = new Map<string, number>()
      for (const ids of assignScenarioPersonnel(3).values()) {
        ids.forEach((id, index) => violations.set(id, distances[index] ?? 300))
      }
      ops.flags.geofenceViolations = violations
    },
  }),
  defineScenario({
    id: "month-end-close",
    label: "Ay sonu kapanışı",
    description:
      "Kayıtlar temiz (eksik çıkış yok); geçen ayın dönemleri açık. Bölge → İK onayı → kilit → bordro aktarımı.",
    phase: 2,
    setup: () => {
      ops.flags.noise = false
      ops.flags.missingCheckouts = false
      ops.flags.previousMonthStatus = "open"
    },
  }),
  defineScenario({
    id: "period-locked",
    label: "Kilitli dönem",
    description:
      "Geçen ayın puantaj dönemleri kilitli; düzenleme denemesi 409 döner.",
    phase: 2,
    setup: () => {
      ops.flags.lockPreviousMonth = true
    },
  }),
  defineScenario({
    id: "realtime-down",
    label: "Canlı bağlantı yok",
    description:
      "WebSocket bağlantıları reddedilir; ekranlar periyodik sorguya (polling) düşer.",
    phase: 2,
    setup: () => {
      setRealtimeBlocked(true)
    },
  }),
]
