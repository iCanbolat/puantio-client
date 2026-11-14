import type { CertificateType } from "@/entities/location"
import { addMonthsIso } from "@/entities/ohs"
import { toIsoDate } from "@/shared/lib/date"
import { addDaysIso } from "@/shared/lib/work-time"

import { mockClock } from "../clock"
import { db, newId } from "../db"
import { mockUserId } from "../tenancy/users"
import { assignScenarioPersonnel, scenarioLocationId } from "./phase2"
import { defineScenario } from "./types"

/**
 * Faz 6 senaryoları. Tarihler senaryo kurulduğu andaki mock saate göredir (E2E'de `?saat=`
 * senaryodan önce uygulanır).
 */
function tenants() {
  return db.tenants.findMany(
    (tenant) => tenant.kind === "tenant" && tenant.modules.includes("ohs")
  )
}

const today = () => toIsoDate(mockClock.now())

/** Senaryo lokasyonunun hastane gereksinimi */
export const HOSPITAL_REQUIREMENTS: CertificateType[] = [
  "hygiene",
  "hospital_infection",
]

/**
 * `expired-certificates` kova fixture'ı (TC-6.3-02). Kiracının tüm sertifikaları silinir,
 * yalnızca aşağıdakiler eklenir.
 */
export const EXPIRED_CERT_BUCKETS = { expired: 2, d30: 3, d60: 1, d90: 2 }

/** Senaryo personeli sırası: 0 süresi dolmuş, 1 eksik, 2 geçerli, 3 yakında doluyor */
export const CERT_SCENARIO_ROLES = [
  "expired",
  "missing",
  "valid",
  "expiring",
] as const

function insertCert(
  tenantId: string,
  personnelId: string,
  type: CertificateType,
  expiresInDays: number
) {
  const expiresAt = addDaysIso(today(), expiresInDays)
  db.certificates.insert({
    id: newId("cert"),
    tenantId,
    personnelId,
    type,
    number: `${type.slice(0, 2).toUpperCase()}-${String(100000 + db.certificates.count())}`,
    issuedAt: addMonthsIso(expiresAt, -12),
    expiresAt,
    uploadId: null,
    createdAt: mockClock.now().toISOString(),
  })
}

/** Senaryo lokasyonunu hastane yapar ve 4 senaryo personelini oraya taşır */
function prepareHospital(): Map<string, string[]> {
  const people = assignScenarioPersonnel(4)
  for (const tenant of tenants()) {
    const locationId = scenarioLocationId(tenant.slug)
    if (!locationId) continue
    db.locations.update(locationId, {
      requiredCertificates: HOSPITAL_REQUIREMENTS,
      hazardClass: "very_dangerous",
    })
  }
  return people
}

function setupExpiredCertificates(): void {
  const people = prepareHospital()
  for (const tenant of tenants()) {
    const ids = people.get(tenant.slug) ?? []
    const [expired, missing, valid, expiring] = ids
    if (!expired || !missing || !valid || !expiring) continue
    for (const cert of db.certificates.findMany(
      (item) => item.tenantId === tenant.slug
    ))
      db.certificates.remove(cert.id)
    insertCert(tenant.slug, expired, "hygiene", 200)
    insertCert(tenant.slug, expired, "hospital_infection", -20)
    insertCert(tenant.slug, missing, "hygiene", 15)
    insertCert(tenant.slug, valid, "hygiene", 45)
    insertCert(tenant.slug, valid, "hospital_infection", 75)
    insertCert(tenant.slug, expiring, "hygiene", 10)
    insertCert(tenant.slug, expiring, "hospital_infection", 20)
    // Başka lokasyonlardaki iki kayıt (kovalara katılır)
    const others = db.personnel
      .findMany(
        (person) =>
          person.tenantId === tenant.slug &&
          person.status === "active" &&
          person.terminationDate === null &&
          !ids.includes(person.id)
      )
      .slice(0, 2)
    if (others[0]) insertCert(tenant.slug, others[0].id, "first_aid", -5)
    if (others[1]) insertCert(tenant.slug, others[1].id, "first_aid", 80)
  }
}

function setupTrainingOverdue(): void {
  const people = prepareHospital()
  for (const tenant of tenants()) {
    const [never, overdue] = people.get(tenant.slug) ?? []
    for (const record of db.trainingRecords.findMany(
      (item) => item.personnelId === never || item.personnelId === overdue
    ))
      db.trainingRecords.remove(record.id)
    if (overdue) {
      // Çok tehlikeli sınıfta yenileme 1 yıl: 14 ay önceki eğitim gecikmiş
      db.trainingRecords.insert({
        id: newId("tr"),
        tenantId: tenant.slug,
        personnelId: overdue,
        typeId: "temel-isg",
        completedAt: addMonthsIso(today(), -14),
        sessionId: null,
      })
    }
  }
}

function setupHealthDue(): void {
  const people = assignScenarioPersonnel(3)
  for (const tenant of tenants()) {
    const [overdue, soon, none] = people.get(tenant.slug) ?? []
    for (const id of [overdue, soon, none]) {
      if (!id) continue
      const record = db.healthRecords.findFirst(
        (item) => item.personnelId === id
      )
      if (record) db.healthRecords.remove(record.id)
    }
    const insert = (personnelId: string | undefined, nextExamAt: string) => {
      if (!personnelId) return
      db.healthRecords.insert({
        id: newId("hl"),
        tenantId: tenant.slug,
        personnelId,
        examinedAt: addMonthsIso(nextExamAt, -12),
        nextExamAt,
        result: "fit",
        vaccinations: [],
        updatedAt: mockClock.now().toISOString(),
        updatedBy: "İSG uzmanı",
      })
    }
    insert(overdue, addDaysIso(today(), -10))
    insert(soon, addDaysIso(today(), 12))
  }
}

/** Senaryo personeli 0: yalnızca kimlik, ikametgah, SGK; adli sicil 8 ay önce (süresi geçmiş) */
export const INCOMPLETE_FILE = {
  present: ["kimlik", "ikametgah", "sgk-giris"],
  expired: ["adli-sicil"],
  missing: ["is-sozlesmesi", "kvkk-aydinlatma"],
  /** 6 zorunlu belgeden 3'ü tamam */
  completion: 50,
}

function setupPersonnelFileIncomplete(): void {
  const people = assignScenarioPersonnel(1)
  for (const tenant of tenants()) {
    const [personnelId] = people.get(tenant.slug) ?? []
    if (!personnelId) continue
    for (const doc of db.personnelDocuments.findMany(
      (item) => item.personnelId === personnelId
    ))
      db.personnelDocuments.remove(doc.id)
    for (const typeId of [
      ...INCOMPLETE_FILE.present,
      ...INCOMPLETE_FILE.expired,
    ]) {
      db.personnelDocuments.insert({
        id: newId("doc"),
        tenantId: tenant.slug,
        personnelId,
        typeId,
        versions: [
          {
            uploadId: `up-scn-${personnelId}-${typeId}`,
            name: `${typeId}.pdf`,
            issuedAt:
              typeId === "adli-sicil" ? addMonthsIso(today(), -8) : null,
            uploadedAt: mockClock.now().toISOString(),
            uploadedBy: "İK",
          },
        ],
      })
    }
  }
}

/** Müşteri kullanıcısının (musteri) ilk aktif lokasyonu hastane olur ve kadrosu oraya taşınır */
export function portalPackLocationId(tenantId: string): string | null {
  const user = db.users.findById(mockUserId(tenantId, "musteri"))
  const customerId = user?.scope.kind === "customers" ? user.scope.ids[0] : null
  if (!customerId) return null
  return (
    db.locations.findFirst(
      (item) =>
        item.tenantId === tenantId &&
        item.customerId === customerId &&
        item.status === "active"
    )?.id ?? null
  )
}

function setupAuditPackHospital(): void {
  setupExpiredCertificates()
  for (const tenant of tenants()) {
    const locationId = portalPackLocationId(tenant.slug)
    if (!locationId) continue
    db.locations.update(locationId, {
      requiredCertificates: HOSPITAL_REQUIREMENTS,
      hazardClass: "very_dangerous",
    })
    // Senaryo personeli müşteri lokasyonuna taşınır
    const scenarioLocation = scenarioLocationId(tenant.slug)
    for (const person of db.personnel.findMany(
      (item) =>
        item.tenantId === tenant.slug &&
        item.homeLocationId === scenarioLocation
    ))
      db.personnel.update(person.id, { homeLocationId: locationId })
    db.tenants.update(tenant.slug, {
      rules: {
        ...tenant.rules,
        ohs: { ...tenant.rules.ohs, includeHealthFitnessInAuditPack: true },
      },
    })
  }
}

export const phase6Scenarios = [
  defineScenario({
    id: "expired-certificates",
    label: "Süresi dolmuş sertifikalar",
    description:
      "Senaryo lokasyonu hastane (hijyen + enfeksiyon eğitimi zorunlu). 4 personel: süresi dolmuş, eksik, geçerli, yakında doluyor. Kovalar: 2 dolmuş, 3 (30 gün), 1 (60 gün), 2 (90 gün).",
    phase: 6,
    setup: setupExpiredCertificates,
  }),
  defineScenario({
    id: "training-overdue",
    label: "Gecikmiş İSG eğitimi",
    description:
      "Hastane lokasyonunda (çok tehlikeli) bir personel hiç eğitim almamış, biri 14 ay önce almış (yenileme 1 yıl).",
    phase: 6,
    setup: setupTrainingOverdue,
  }),
  defineScenario({
    id: "health-due",
    label: "Periyodik muayene vadesi",
    description:
      "Bir personelin muayenesi 10 gün gecikmiş, biri 12 gün sonra, birinin kaydı yok.",
    phase: 6,
    setup: setupHealthDue,
  }),
  defineScenario({
    id: "personnel-file-incomplete",
    label: "Eksik özlük dosyası",
    description:
      "Senaryo personelinde 3 belge var, adli sicil süresi geçmiş, iş sözleşmesi ve KVKK aydınlatma eksik (%50).",
    phase: 6,
    setup: setupPersonnelFileIncomplete,
  }),
  defineScenario({
    id: "audit-pack-hospital",
    label: "Hastane denetim paketi",
    description:
      "Müşteri (musteri) lokasyonu hastane; senaryo personeli orada. Pakette sağlık uygunluğu açık (yalnızca “Uygun”).",
    phase: 6,
    setup: setupAuditPackHospital,
  }),
]
