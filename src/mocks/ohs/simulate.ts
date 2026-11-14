import { CERTIFICATE_LABELS } from "@/entities/location"
import { toIsoDate } from "@/shared/lib/date"
import { addDaysIso } from "@/shared/lib/work-time"

import { mockClock } from "../clock"
import { db } from "../db"
import { scenarioLocationId } from "../scenarios/phase2"
import { personName } from "./store"

/**
 * Dev paneli: senaryo lokasyonunda geçerli bir gerekli sertifikanın süresini dün bitmiş yapar
 * (vardiya panosunda uygunluk engelini denemek için).
 */
export function simulateCertificateExpiry(tenantId: string): string | null {
  const locationId = scenarioLocationId(tenantId)
  const location = locationId ? db.locations.findById(locationId) : null
  if (!location || location.requiredCertificates.length === 0) return null
  const today = toIsoDate(mockClock.now())
  const people = new Set(
    db.personnel
      .findMany((person) => person.homeLocationId === location.id)
      .map((person) => person.id)
  )
  const cert = db.certificates.findFirst(
    (item) =>
      item.tenantId === tenantId &&
      people.has(item.personnelId) &&
      location.requiredCertificates.includes(item.type) &&
      (item.expiresAt === null || item.expiresAt >= today)
  )
  if (!cert) return null
  db.certificates.update(cert.id, { expiresAt: addDaysIso(today, -1) })
  const person = db.personnel.findById(cert.personnelId)
  return `${person ? personName(person) : "—"} · ${CERTIFICATE_LABELS[cert.type]} (${location.name})`
}
