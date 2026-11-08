import type { Commitment, ContractLocation } from "../model/contract"

export interface CommitmentIssue {
  index: number
  message: string
}

/**
 * Taahhüt kadro tutarlılığı (şema kontrolüne ek): lokasyon kapsamda olmalı, aynı lokasyon ×
 * pozisyon iki kez girilmemeli, her kapsam lokasyonunda en az bir taahhüt olmalı.
 */
export function validateCommitments(
  commitments: readonly Commitment[],
  locations: readonly Pick<ContractLocation, "locationId" | "locationName">[]
): { issues: CommitmentIssue[]; uncoveredLocations: string[] } {
  const inScope = new Set(locations.map((location) => location.locationId))
  const seen = new Set<string>()
  const issues: CommitmentIssue[] = []
  commitments.forEach((commitment, index) => {
    if (!inScope.has(commitment.locationId)) {
      issues.push({ index, message: "Lokasyon sözleşme kapsamında değil" })
      return
    }
    const key = `${commitment.locationId}|${commitment.position}`
    if (seen.has(key))
      issues.push({ index, message: "Bu lokasyon ve pozisyon zaten girildi" })
    seen.add(key)
  })
  const covered = new Set(commitments.map((item) => item.locationId))
  return {
    issues,
    uncoveredLocations: locations
      .filter((location) => !covered.has(location.locationId))
      .map((location) => location.locationName),
  }
}

/** Sözleşmenin toplam taahhüt kadrosu */
export function totalHeadcount(commitments: readonly Commitment[]): number {
  return commitments.reduce((sum, item) => sum + item.headcount, 0)
}
