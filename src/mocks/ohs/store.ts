import type { CertificateType } from "@/entities/location"
import {
  effectiveHazardClass,
  evaluateRequirements,
  trainingDueDate,
  trainingState,
  type TrainingState,
  type TrainingType,
} from "@/entities/ohs"
import {
  DEFAULT_OHS_RULES,
  type HazardClass,
  type OhsRules,
} from "@/entities/tenant"
import { toIsoDate } from "@/shared/lib/date"

import { mockClock } from "../clock"
import { db } from "../db"
import type { MockOhsSettings, MockPersonnel } from "../db/types"
import { apiPath } from "../http"
import {
  DEFAULT_CERTIFICATE_VALIDITY,
  DEFAULT_DOCUMENT_TYPES,
  DEFAULT_TRAINING_TYPES,
} from "./catalog"

export const ohsRules = (tenant: { rules: { ohs?: OhsRules } }): OhsRules =>
  tenant.rules.ohs ?? DEFAULT_OHS_RULES

export const today = () => toIsoDate(mockClock.now())

export function ohsSettingsFor(tenantId: string): MockOhsSettings {
  return (
    db.ohsSettings.findById(tenantId) ??
    db.ohsSettings.insert({
      id: tenantId,
      tenantId,
      trainingTypes: structuredClone(DEFAULT_TRAINING_TYPES),
      documentTypes: structuredClone(DEFAULT_DOCUMENT_TYPES),
      certificateValidityMonths: { ...DEFAULT_CERTIFICATE_VALIDITY },
    })
  )
}

export function personHazardClass(
  person: Pick<MockPersonnel, "homeLocationId">,
  rules: OhsRules
): HazardClass {
  const location = person.homeLocationId
    ? db.locations.findById(person.homeLocationId)
    : null
  return effectiveHazardClass(location, rules)
}

export function requiredCertificatesFor(
  person: Pick<MockPersonnel, "homeLocationId">
): CertificateType[] {
  const location = person.homeLocationId
    ? db.locations.findById(person.homeLocationId)
    : null
  return location?.requiredCertificates ?? []
}

export function personCertificates(personnelId: string) {
  return db.certificates.findMany((item) => item.personnelId === personnelId)
}

/** Personel için zorunlu eğitimler: herkese olanlar + lokasyon gereksinimine bağlı olanlar */
export function applicableTrainings(
  types: readonly TrainingType[],
  required: readonly CertificateType[]
): TrainingType[] {
  return types.filter(
    (type) =>
      type.isActive &&
      (type.requiredFor.length === 0 ||
        type.requiredFor.some((cert) => required.includes(cert)))
  )
}

export interface TrainingStatusRow {
  type: TrainingType
  lastCompletedAt: string | null
  dueAt: string | null
  state: TrainingState
}

export function trainingStatusFor(
  person: MockPersonnel,
  settings: MockOhsSettings,
  rules: OhsRules,
  onDate = today()
): TrainingStatusRow[] {
  const hazard = personHazardClass(person, rules)
  const records = db.trainingRecords.findMany(
    (record) => record.personnelId === person.id
  )
  return applicableTrainings(
    settings.trainingTypes,
    requiredCertificatesFor(person)
  ).map((type) => {
    const last =
      records
        .filter((record) => record.typeId === type.id)
        .map((record) => record.completedAt)
        .sort()
        .at(-1) ?? null
    const dueAt = last
      ? trainingDueDate(last, type.renewal, hazard, rules)
      : null
    return {
      type,
      lastCompletedAt: last,
      dueAt,
      state: trainingState(last, dueAt, onDate),
    }
  })
}

export function requirementsFor(
  person: MockPersonnel,
  rules: OhsRules,
  onDate = today()
) {
  return evaluateRequirements(
    requiredCertificatesFor(person),
    personCertificates(person.id).map((item) => ({
      type: item.type,
      expiresAt: item.expiresAt,
    })),
    onDate,
    rules.expiringWarnDays
  )
}

export const personName = (
  person: Pick<MockPersonnel, "firstName" | "lastName">
) => `${person.firstName} ${person.lastName}`

/** İmzalı, 5 dk geçerli belge adresi */
export function signedDocUrl(id: string): string {
  const expires = mockClock.now().getTime() + 5 * 60_000
  return `${apiPath(`/files/personnel-docs/${encodeURIComponent(id)}`)}?exp=${String(expires)}&sig=${id.length.toString(16)}${String(expires).slice(-6)}`
}

export function locationLabels(locationId: string | null) {
  const location = locationId ? db.locations.findById(locationId) : null
  const unit = location ? db.orgUnits.findById(location.orgUnitId) : null
  return {
    locationName: location?.name ?? null,
    orgUnitId: unit?.id ?? null,
    orgUnitName: unit?.name ?? null,
  }
}
