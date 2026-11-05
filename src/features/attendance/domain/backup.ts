import { haversineDistanceMeters, type LatLng } from "@/shared/lib/geo"

export interface BackupCandidateInput {
  personnelId: string
  isFloater: boolean
  position: LatLng | null
  /** Vardiya saatinde başka ataması var mı */
  busy: boolean
  onLeave: boolean
}

/**
 * Yedek önerileri: meşgul ve izinli olanlar çıkarılır, lokasyona mesafeye göre sıralanır.
 * Eşit mesafede yedek havuzu önce gelir. Konumu bilinmeyenler sona düşer.
 */
export function rankBackupCandidates<T extends BackupCandidateInput>(
  target: LatLng,
  candidates: readonly T[],
  limit = 10
): (T & { distanceKm: number })[] {
  return candidates
    .filter((candidate) => !candidate.busy && !candidate.onLeave)
    .map((candidate) => ({
      ...candidate,
      distanceKm: candidate.position
        ? Math.round(
            haversineDistanceMeters(target, candidate.position) / 100
          ) / 10
        : Number.POSITIVE_INFINITY,
    }))
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm || Number(b.isFloater) - Number(a.isFloater)
    )
    .slice(0, limit)
}
