import type { CertificateType } from "@/entities/location"
import { addMonthsIso, effectiveHazardClass } from "@/entities/ohs"
import { toIsoDate } from "@/shared/lib/date"
import { addDaysIso } from "@/shared/lib/work-time"

import { db } from "../db"
import type {
  MockCertificate,
  MockHealthRecord,
  MockPersonnelDocument,
  MockTrainingRecord,
} from "../db/types"
import { SEED_REFERENCE_DATE } from "../factories/faker"
import type { TenantMasterData } from "../master-data/factories"
import type { MockTenant } from "../tenancy/tenants"
import { HEALTH_EXAM_YEARS, VACCINE_TYPES } from "./catalog"
import { applicableTrainings, ohsSettingsFor } from "./store"

/**
 * Deterministik sözde rastgele üretici. Faker akışı kullanılmaz: İSG verisi eklenince
 * sonraki kiracıların ana verisi (ve önceki fazların fixture'ları) değişmesin.
 */
export function seededRandom(key: string): () => number {
  let state = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    state = Math.imul(state ^ key.charCodeAt(index), 16777619)
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const between = (random: () => number, min: number, max: number) =>
  Math.floor(random() * (max - min + 1)) + min

const CERT_PREFIX: Record<CertificateType, string> = {
  hygiene: "HJ",
  hospital_infection: "HE",
  food_handling: "GH",
  work_at_height: "YC",
  electrical: "EY",
  first_aid: "İY",
  security_id: "ÖGG",
  firearm: "SR",
  airport_permit: "HG",
}

/** Eğitim, sertifika, sağlık ve özlük kayıtları (SEED_REFERENCE_DATE'e göre) */
export function seedOhs(tenant: MockTenant, data: TenantMasterData): void {
  const settings = ohsSettingsFor(tenant.slug)
  const rules = tenant.rules.ohs
  const reference = toIsoDate(SEED_REFERENCE_DATE)
  const locations = new Map(data.locations.map((item) => [item.id, item]))
  const trainings: MockTrainingRecord[] = []
  const certificates: MockCertificate[] = []
  const health: MockHealthRecord[] = []
  const documents: MockPersonnelDocument[] = []

  for (const person of data.personnel) {
    const random = seededRandom(`${tenant.slug}:${person.id}`)
    const location = person.homeLocationId
      ? locations.get(person.homeLocationId)
      : undefined
    const required = location?.requiredCertificates ?? []
    const hazard = effectiveHazardClass(location, rules)

    for (const type of applicableTrainings(settings.trainingTypes, required)) {
      if (random() < 0.08) continue
      const completedAt = addDaysIso(reference, -between(random, 20, 900))
      trainings.push({
        id: `tr-${person.id}-${type.id}`,
        tenantId: tenant.slug,
        personnelId: person.id,
        typeId: type.id,
        completedAt:
          completedAt < person.hireDate ? person.hireDate : completedAt,
        sessionId: null,
      })
    }

    for (const type of required) {
      if (random() < 0.12) continue
      const validity = settings.certificateValidityMonths[type] ?? null
      const expiresAt = addDaysIso(reference, between(random, -45, 420))
      certificates.push({
        id: `cert-${person.id}-${type}`,
        tenantId: tenant.slug,
        personnelId: person.id,
        type,
        number: `${CERT_PREFIX[type]}-${String(between(random, 100000, 999999))}`,
        issuedAt:
          validity === null
            ? addDaysIso(reference, -400)
            : addMonthsIso(expiresAt, -validity),
        expiresAt: validity === null ? null : expiresAt,
        uploadId: null,
        createdAt: SEED_REFERENCE_DATE.toISOString(),
      })
    }

    if (random() < 0.9) {
      const examinedAt = addDaysIso(reference, -between(random, 10, 700))
      const roll = random()
      health.push({
        id: `hl-${person.id}`,
        tenantId: tenant.slug,
        personnelId: person.id,
        examinedAt,
        nextExamAt: addMonthsIso(examinedAt, HEALTH_EXAM_YEARS[hazard] * 12),
        result: roll < 0.9 ? "fit" : roll < 0.98 ? "conditional" : "unfit",
        vaccinations: required.includes("hospital_infection")
          ? VACCINE_TYPES.slice(0, 2).map((type) => ({
              type,
              date: addDaysIso(examinedAt, 7),
              nextDoseAt:
                type === "Tetanoz" ? addMonthsIso(examinedAt, 120) : null,
            }))
          : [],
        updatedAt: `${examinedAt}T10:00:00+03:00`,
        updatedBy: "İSG uzmanı",
      })
    }

    for (const type of settings.documentTypes) {
      if (random() < (type.required ? 0.14 : 0.5)) continue
      const uploadedAt = `${person.hireDate}T09:00:00+03:00`
      const issuedAt =
        type.validityMonths === null
          ? null
          : addDaysIso(reference, -between(random, 0, 300))
      documents.push({
        id: `doc-${person.id}-${type.id}`,
        tenantId: tenant.slug,
        personnelId: person.id,
        typeId: type.id,
        versions: [
          {
            uploadId: `up-doc-${person.id}-${type.id}`,
            name: `${type.id}.pdf`,
            issuedAt,
            uploadedAt,
            uploadedBy: "İK",
          },
        ],
      })
    }
  }

  db.trainingRecords.insertMany(trainings)
  db.certificates.insertMany(certificates)
  db.healthRecords.insertMany(health)
  db.personnelDocuments.insertMany(documents)
}
