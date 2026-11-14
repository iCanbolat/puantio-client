import { CERTIFICATE_LABELS, type CertificateType } from "@/entities/location"
import type { HazardClass, OhsRules } from "@/entities/tenant"
import { formatDate } from "@/shared/lib/format"
import { addDaysIso, diffIsoDays } from "@/shared/lib/work-time"

import type {
  ComplianceState,
  ExpiryBucket,
  PersonCertificate,
  TrainingRenewal,
  TrainingState,
} from "../model/ohs"

/** "YYYY-MM-DD" + n ay. Ay sonu taşmasında ayın son günü (31 Oca + 1 ay → 28/29 Şub). */
export function addMonthsIso(isoDate: string, months: number): string {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number)
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = (index % 12) + 1
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`
}

/** Geçerlilik: bitiş günü dahil geçerlidir, ertesi gün dolmuş sayılır. */
export function certificateState(
  expiresAt: string | null,
  onDate: string,
  warnDays: number
): Exclude<ComplianceState, "missing"> {
  if (expiresAt === null) return "valid"
  const remaining = diffIsoDays(onDate, expiresAt)
  if (remaining < 0) return "expired"
  if (remaining < warnDays) return "expiring"
  return "valid"
}

const STATE_RANK: Record<ComplianceState, number> = {
  valid: 0,
  expiring: 1,
  expired: 2,
  missing: 3,
}

export function worstState(
  states: readonly ComplianceState[]
): ComplianceState {
  return states.reduce<ComplianceState>(
    (worst, state) => (STATE_RANK[state] > STATE_RANK[worst] ? state : worst),
    "valid"
  )
}

export interface RequirementResult {
  type: CertificateType
  state: ComplianceState
  expiresAt: string | null
}

/**
 * Lokasyon gereksinimlerini personelin sertifikalarıyla karşılaştırır. Aynı tipte birden
 * çok sertifika varsa en geç biteni sayılır.
 */
export function evaluateRequirements(
  required: readonly CertificateType[],
  certificates: readonly PersonCertificate[],
  onDate: string,
  warnDays: number
): RequirementResult[] {
  return required.map((type) => {
    const matching = certificates.filter((item) => item.type === type)
    if (matching.length === 0)
      return { type, state: "missing", expiresAt: null }
    const best = matching.reduce((a, b) =>
      a.expiresAt === null ||
      (b.expiresAt !== null && a.expiresAt >= b.expiresAt)
        ? a
        : b
    )
    return {
      type,
      state: certificateState(best.expiresAt, onDate, warnDays),
      expiresAt: best.expiresAt,
    }
  })
}

/** Uyarı kovası (90 günden sonra bitenler ve süresizler kovada değildir) */
export function expiryBucket(
  expiresAt: string | null,
  today: string
): ExpiryBucket | null {
  if (expiresAt === null) return null
  const remaining = diffIsoDays(today, expiresAt)
  if (remaining < 0) return "expired"
  if (remaining <= 30) return "d30"
  if (remaining <= 60) return "d60"
  if (remaining <= 90) return "d90"
  return null
}

/** Personelin tehlike sınıfı: ana lokasyonun sınıfı, yoksa kiracı varsayılanı */
export function effectiveHazardClass(
  location: { hazardClass: HazardClass | null } | null | undefined,
  rules: Pick<OhsRules, "defaultHazardClass">
): HazardClass {
  return location?.hazardClass ?? rules.defaultHazardClass
}

/** Yenileme periyodu (ay); `null` = yenileme yok */
export function renewalMonths(
  renewal: TrainingRenewal,
  hazardClass: HazardClass,
  rules: Pick<OhsRules, "renewalYears">
): number | null {
  switch (renewal.kind) {
    case "hazard_class":
      return rules.renewalYears[hazardClass] * 12
    case "months":
      return renewal.months
    case "none":
      return null
  }
}

/** Bir sonraki eğitim tarihi; yenilemesiz eğitimde `null` */
export function trainingDueDate(
  completedAt: string,
  renewal: TrainingRenewal,
  hazardClass: HazardClass,
  rules: Pick<OhsRules, "renewalYears">
): string | null {
  const months = renewalMonths(renewal, hazardClass, rules)
  return months === null ? null : addMonthsIso(completedAt, months)
}

/** Eğitim durumu: hiç almamış, gecikmiş, 30 gün içinde yenilenmeli, geçerli */
export function trainingState(
  lastCompletedAt: string | null,
  dueAt: string | null,
  today: string
): TrainingState {
  if (lastCompletedAt === null) return "never"
  if (dueAt === null) return "valid"
  const remaining = diffIsoDays(today, dueAt)
  if (remaining < 0) return "overdue"
  if (remaining <= 30) return "expiring"
  return "valid"
}

/** Bir tarihten n gün sonrası (senaryolar ve formlar için kısayol) */
export const daysFrom = (isoDate: string, days: number) =>
  addDaysIso(isoDate, days)

/** Vardiya panosu ve sunucu reddi için okunur açıklama */
export function requirementMessage(result: RequirementResult): string {
  const label = CERTIFICATE_LABELS[result.type]
  switch (result.state) {
    case "missing":
      return `${label} sertifikası yok; bu lokasyonda zorunlu.`
    case "expired":
      return `${label} sertifikası ${result.expiresAt ? formatDate(result.expiresAt) : ""} tarihinde sona erdi; bu lokasyonda zorunlu.`
    case "expiring":
      return `${label} sertifikası ${result.expiresAt ? formatDate(result.expiresAt) : ""} tarihinde sona eriyor.`
    case "valid":
      return `${label} sertifikası geçerli.`
  }
}
