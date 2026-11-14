import { http } from "msw"
import * as XLSX from "xlsx"
import { z } from "zod"

import { POSITION_LABELS } from "@/entities/personnel"
import { CERTIFICATE_LABELS } from "@/entities/location"
import {
  COMPLIANCE_LABELS,
  TRAINING_STATE_LABELS,
  expiryBucket,
  effectiveHazardClass,
} from "@/entities/ohs"
import { HAZARD_CLASS_LABELS } from "@/entities/tenant"
import { buildAuditPackRows } from "@/features/ohs/domain/audit-pack"
import {
  attendanceInputSchema,
  certificateInputSchema,
  certificateListParamsSchema,
  ohsSettingsSchema,
  trainingSessionInputSchema,
  trainingStatusParamsSchema,
  type AuditPack,
  type BucketCounts,
  type Certificate,
  type OhsOverview,
  type PersonnelOhs,
  type TrainingSession,
  type TrainingStatusRow,
} from "@/features/ohs/model/ohs"
import { formatDate, includesTr } from "@/shared/lib/format"
import { addDaysIso } from "@/shared/lib/work-time"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type {
  MockCertificate,
  MockLocation,
  MockPersonnel,
  MockTrainingSession,
} from "../db/types"
import {
  apiPath,
  created,
  fileResponse,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import { paginate } from "../operations/common"
import { assignmentsBetween } from "../operations/plan"
import {
  locationLabels,
  ohsRules,
  ohsSettingsFor,
  personCertificates,
  personHazardClass,
  personName,
  requirementsFor,
  signedDocUrl,
  today,
  trainingStatusFor,
} from "./store"

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export function visiblePersonnel(auth: AuthContext): MockPersonnel[] {
  const scope = createScope(auth)
  return db.personnel.findMany(
    (person) =>
      scope.personnel(person) &&
      person.status !== "terminated" &&
      person.terminationDate === null
  )
}

function serializeSession(session: MockTrainingSession): TrainingSession {
  const settings = ohsSettingsFor(session.tenantId)
  const type = settings.trainingTypes.find((item) => item.id === session.typeId)
  return {
    id: session.id,
    number: session.number,
    typeId: session.typeId,
    typeName: type?.name ?? "—",
    date: session.date,
    trainer: session.trainer,
    locationId: session.locationId,
    locationName: locationLabels(session.locationId).locationName,
    durationHours: session.durationHours,
    status: session.status,
    participants: session.participants.map((item) => {
      const person = db.personnel.findById(item.personnelId)
      return {
        personnelId: item.personnelId,
        name: person ? personName(person) : "—",
        employeeNumber: person?.employeeNumber ?? "—",
        attended: item.attended,
      }
    }),
  }
}

/** Aynı tipte daha yeni sertifikası olan kayıt "yenilendi" sayılır ve kovaya girmez */
function latestCertificates(certs: readonly MockCertificate[]) {
  const latest = new Map<string, MockCertificate>()
  for (const cert of certs) {
    const key = `${cert.personnelId}|${cert.type}`
    const current = latest.get(key)
    if (!current || current.issuedAt <= cert.issuedAt) latest.set(key, cert)
  }
  return new Set([...latest.values()].map((cert) => cert.id))
}

function serializeCertificate(
  cert: MockCertificate,
  current: Set<string>,
  onDate: string
): Certificate {
  const person = db.personnel.findById(cert.personnelId)
  const superseded = !current.has(cert.id)
  return {
    id: cert.id,
    personnelId: cert.personnelId,
    personnelName: person ? personName(person) : "—",
    employeeNumber: person?.employeeNumber ?? "—",
    locationName: locationLabels(person?.homeLocationId ?? null).locationName,
    type: cert.type,
    number: cert.number,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
    bucket: superseded ? null : expiryBucket(cert.expiresAt, onDate),
    superseded,
    documentUrl: cert.uploadId ? signedDocUrl(cert.uploadId) : null,
  }
}

export function certificateSummary(auth: AuthContext, onDate = today()) {
  const people = visiblePersonnel(auth)
  const ids = new Set(people.map((person) => person.id))
  const certs = db.certificates.findMany(
    (cert) => cert.tenantId === auth.tenant.slug && ids.has(cert.personnelId)
  )
  const current = latestCertificates(certs)
  const buckets: BucketCounts = { expired: 0, d30: 0, d60: 0, d90: 0 }
  for (const cert of certs) {
    if (!current.has(cert.id)) continue
    const bucket = expiryBucket(cert.expiresAt, onDate)
    if (bucket) buckets[bucket] += 1
  }
  const rules = ohsRules(auth.tenant)
  const missing = people.filter((person) =>
    requirementsFor(person, rules, onDate).some(
      (item) => item.state === "missing"
    )
  ).length
  return { buckets, missing }
}

function trainingRows(auth: AuthContext): TrainingStatusRow[] {
  const settings = ohsSettingsFor(auth.tenant.slug)
  const rules = ohsRules(auth.tenant)
  const onDate = today()
  return visiblePersonnel(auth).flatMap((person) => {
    const labels = locationLabels(person.homeLocationId)
    const hazard = personHazardClass(person, rules)
    return trainingStatusFor(person, settings, rules, onDate).map((row) => ({
      personnelId: person.id,
      name: personName(person),
      employeeNumber: person.employeeNumber,
      locationName: labels.locationName,
      orgUnitName: labels.orgUnitName,
      hazardClass: hazard,
      typeId: row.type.id,
      typeName: row.type.name,
      lastCompletedAt: row.lastCompletedAt,
      dueAt: row.dueAt,
      state: row.state,
    }))
  })
}

function personnelOhs(person: MockPersonnel, auth: AuthContext): PersonnelOhs {
  const rules = ohsRules(auth.tenant)
  const onDate = today()
  const location = person.homeLocationId
    ? db.locations.findById(person.homeLocationId)
    : null
  const certs = personCertificates(person.id)
  const current = latestCertificates(certs)
  return {
    personnelId: person.id,
    hazardClass: effectiveHazardClass(location, rules),
    hazardClassSource: location?.hazardClass ? "location" : "tenant",
    locationName: location?.name ?? null,
    requirements: requirementsFor(person, rules, onDate),
    trainings: trainingStatusFor(
      person,
      ohsSettingsFor(auth.tenant.slug),
      rules,
      onDate
    ).map((row) => ({
      typeId: row.type.id,
      typeName: row.type.name,
      lastCompletedAt: row.lastCompletedAt,
      dueAt: row.dueAt,
      state: row.state,
    })),
    certificates: certs
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .map((cert) => serializeCertificate(cert, current, onDate)),
  }
}

/** Lokasyondaki kadro: ana lokasyonu burası olanlar + ±7 gün içinde burada vardiyası olanlar */
function locationCrew(location: MockLocation, onDate: string): MockPersonnel[] {
  const ids = new Set(
    db.personnel
      .findMany(
        (person) =>
          person.homeLocationId === location.id &&
          person.status !== "terminated" &&
          person.terminationDate === null
      )
      .map((person) => person.id)
  )
  for (const assignment of assignmentsBetween(
    location.tenantId,
    addDaysIso(onDate, -7),
    addDaysIso(onDate, 7),
    (item) => item.locationId === location.id
  )) {
    ids.add(assignment.personnelId)
  }
  return [...ids]
    .map((id) => db.personnel.findById(id))
    .filter((person): person is MockPersonnel => Boolean(person))
}

export function buildAuditPack(
  auth: AuthContext,
  location: MockLocation
): AuditPack {
  const rules = ohsRules(auth.tenant)
  const settings = ohsSettingsFor(auth.tenant.slug)
  const onDate = today()
  const required = location.requiredCertificates
  const people = locationCrew(location, onDate).map((person) => {
    // Pakette personelin bu lokasyondaki uygunluğu değerlendirilir (ana lokasyonu farklı olabilir)
    const asHere = { ...person, homeLocationId: location.id }
    const health = db.healthRecords.findFirst(
      (record) => record.personnelId === person.id
    )
    return {
      personnelId: person.id,
      name: personName(person),
      position: POSITION_LABELS[person.position],
      trainings: trainingStatusFor(asHere, settings, rules, onDate).map(
        (row) => ({
          typeName: row.type.name,
          state: row.state,
          dueAt: row.dueAt,
        })
      ),
      requirements: requirementsFor(asHere, rules, onDate),
      healthResult: health?.result ?? null,
    }
  })
  const includesHealth = rules.includeHealthFitnessInAuditPack
  const pack = buildAuditPackRows(people, includesHealth)
  return {
    location: {
      id: location.id,
      code: location.code,
      name: location.name,
      customerName: db.customers.findById(location.customerId)?.name ?? "—",
      requiredCertificates: required,
      hazardClass: effectiveHazardClass(location, rules),
    },
    date: onDate,
    generatedAt: mockClock.now().toISOString(),
    includesHealth,
    ...pack,
  }
}

export function auditPackWorkbook(pack: AuditPack): ArrayBuffer {
  const header = [
    "Personel",
    "Görev",
    ...pack.location.requiredCertificates.map(
      (type) => CERTIFICATE_LABELS[type]
    ),
    "Eğitimler",
    ...(pack.includesHealth ? ["Sağlık uygunluğu"] : []),
    "Uygunluk",
  ]
  const rows = pack.rows.map((row) => [
    row.name,
    row.position,
    ...row.certificates.map(
      (cert) =>
        `${COMPLIANCE_LABELS[cert.state]}${cert.expiresAt ? ` (${formatDate(cert.expiresAt)})` : ""}`
    ),
    row.trainings
      .map((item) => `${item.typeName}: ${TRAINING_STATE_LABELS[item.state]}`)
      .join("; "),
    ...(pack.includesHealth ? [row.health === "fit" ? "Uygun" : "—"] : []),
    row.compliant ? "Uygun" : "Uygun değil",
  ])
  const book = XLSX.utils.book_new()
  const info = XLSX.utils.aoa_to_sheet([
    ["Lokasyon", `${pack.location.code} · ${pack.location.name}`],
    ["Müşteri", pack.location.customerName],
    ["Tehlike sınıfı", HAZARD_CLASS_LABELS[pack.location.hazardClass]],
    ["Tarih", formatDate(pack.date)],
    ["Personel", pack.summary.total],
    ["Uygun", pack.summary.compliant],
  ])
  XLSX.utils.book_append_sheet(book, info, "Özet")
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([header, ...rows]),
    "Personel uygunluğu"
  )
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer
}

const sessionCounter = new Map<string, number>()

export const ohsHandlers = [
  http.get(
    apiPath("/ohs/settings"),
    withAuth("ohs:read", ({ auth }) => {
      const settings = ohsSettingsFor(auth.tenant.slug)
      return ok({
        rules: ohsRules(auth.tenant),
        trainingTypes: settings.trainingTypes,
        documentTypes: settings.documentTypes,
        certificateValidityMonths: settings.certificateValidityMonths,
      })
    })
  ),
  http.put(
    apiPath("/ohs/settings"),
    withAuth("ohs:write", async ({ request, auth }) => {
      const body = await parseBody(request, ohsSettingsSchema)
      if (!body.success) return body.response
      const ids = body.data.trainingTypes.map((item) => item.id)
      if (new Set(ids).size !== ids.length)
        return problem(
          422,
          "VALIDATION_FAILED",
          "Eğitim kimlikleri benzersiz olmalı.",
          {
            trainingTypes: ["Eğitim kimlikleri benzersiz olmalı"],
          }
        )
      const tenant = db.tenants.update(auth.tenant.slug, {
        rules: { ...auth.tenant.rules, ohs: structuredClone(body.data.rules) },
      })
      db.ohsSettings.update(auth.tenant.slug, {
        trainingTypes: body.data.trainingTypes,
        documentTypes: body.data.documentTypes,
        certificateValidityMonths: body.data.certificateValidityMonths,
      })
      audit(auth, {
        action: "İSG ayarları güncellendi",
        targetType: "ohs_settings",
        targetLabel: tenant?.displayName ?? auth.tenant.displayName,
        details: `Uygunluk politikası: ${body.data.rules.certificatePolicy === "block" ? "engel" : "uyarı"}`,
      })
      return ok(body.data)
    })
  ),
  http.get(
    apiPath("/ohs/overview"),
    withAuth("ohs:read", ({ auth }) => {
      const onDate = today()
      const summary = certificateSummary(auth, onDate)
      const rows = trainingRows(auth)
      const people = visiblePersonnel(auth)
      let health: OhsOverview["health"] = null
      if (auth.permissions.has("health:read")) {
        const ids = new Set(people.map((person) => person.id))
        const records = db.healthRecords.findMany((record) =>
          ids.has(record.personnelId)
        )
        health = {
          overdue: records.filter((record) => record.nextExamAt < onDate)
            .length,
          dueIn30: records.filter(
            (record) =>
              record.nextExamAt >= onDate &&
              record.nextExamAt <= addDaysIso(onDate, 30)
          ).length,
        }
      }
      const overview: OhsOverview = {
        certificateBuckets: summary.buckets,
        missingCertificates: summary.missing,
        trainings: {
          overdue: rows.filter((row) => row.state === "overdue").length,
          expiring: rows.filter((row) => row.state === "expiring").length,
          never: rows.filter((row) => row.state === "never").length,
        },
        upcomingSessions: db.trainingSessions
          .findMany(
            (session) =>
              session.tenantId === auth.tenant.slug &&
              session.status === "planned" &&
              session.date >= onDate
          )
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5)
          .map((session) => {
            const item = serializeSession(session)
            return {
              id: item.id,
              number: item.number,
              typeName: item.typeName,
              date: item.date,
              participantCount: item.participants.length,
            }
          }),
        health,
      }
      return ok(overview)
    })
  ),
  http.get(
    apiPath("/ohs/training-sessions"),
    withAuth("ohs:read", ({ auth }) =>
      ok({
        items: db.trainingSessions
          .findMany((session) => session.tenantId === auth.tenant.slug)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(serializeSession),
      })
    )
  ),
  http.post(
    apiPath("/ohs/training-sessions"),
    withAuth("ohs:write", async ({ request, auth }) => {
      const body = await parseBody(request, trainingSessionInputSchema)
      if (!body.success) return body.response
      const settings = ohsSettingsFor(auth.tenant.slug)
      const type = settings.trainingTypes.find(
        (item) => item.id === body.data.typeId && item.isActive
      )
      if (!type)
        return problem(422, "VALIDATION_FAILED", "Eğitim türü bulunamadı.", {
          typeId: ["Eğitim türü bulunamadı"],
        })
      const visible = new Set(visiblePersonnel(auth).map((person) => person.id))
      if (body.data.participantIds.some((id) => !visible.has(id)))
        return problem(422, "UNKNOWN_PERSONNEL", "Personel bulunamadı.")
      if (
        body.data.locationId &&
        !createScope(auth).locationId(body.data.locationId)
      )
        return problem(422, "VALIDATION_FAILED", "Lokasyon bulunamadı.", {
          locationId: ["Lokasyon bulunamadı"],
        })
      const next = (sessionCounter.get(auth.tenant.slug) ?? 0) + 1
      sessionCounter.set(auth.tenant.slug, next)
      const session = db.trainingSessions.insert({
        id: newId("trs"),
        tenantId: auth.tenant.slug,
        number: `EĞT-${body.data.date.slice(0, 4)}-${String(next).padStart(4, "0")}`,
        typeId: type.id,
        date: body.data.date,
        trainer: body.data.trainer,
        locationId: body.data.locationId,
        durationHours: body.data.durationHours,
        participants: [...new Set(body.data.participantIds)].map((id) => ({
          personnelId: id,
          attended: null,
        })),
        status: "planned",
        createdAt: mockClock.now().toISOString(),
      })
      audit(auth, {
        action: "Eğitim planlandı",
        targetType: "training_session",
        targetLabel: `${session.number} · ${type.name}`,
        details: `${session.participants.length} katılımcı`,
      })
      return created(serializeSession(session))
    })
  ),
  http.post(
    apiPath("/ohs/training-sessions/:id/attendance"),
    withAuth("ohs:write", async ({ request, params, auth }) => {
      const session = db.trainingSessions.findById(String(params.id))
      if (session?.tenantId !== auth.tenant.slug) return notFound()
      if (session.status !== "planned")
        return problem(
          409,
          "SESSION_CLOSED",
          "Bu eğitimin katılımı daha önce kaydedildi."
        )
      const body = await parseBody(request, attendanceInputSchema)
      if (!body.success) return body.response
      const marks = new Map(
        body.data.attendance.map((item) => [item.personnelId, item.attended])
      )
      const participants = session.participants.map((item) => ({
        ...item,
        attended: marks.get(item.personnelId) ?? false,
      }))
      for (const item of participants) {
        if (!item.attended) continue
        db.trainingRecords.insert({
          id: newId("tr"),
          tenantId: auth.tenant.slug,
          personnelId: item.personnelId,
          typeId: session.typeId,
          completedAt: session.date,
          sessionId: session.id,
        })
      }
      const updated = db.trainingSessions.update(session.id, {
        participants,
        status: "completed",
      })
      audit(auth, {
        action: "Eğitim katılımı kaydedildi",
        targetType: "training_session",
        targetLabel: session.number,
        details: `${participants.filter((item) => item.attended).length}/${participants.length} katıldı`,
      })
      return ok(serializeSession(updated ?? session))
    })
  ),
  http.get(
    apiPath("/ohs/training-status"),
    withAuth("ohs:read", ({ request, auth }) => {
      const query = parseQuery(request, trainingStatusParamsSchema)
      const rows = trainingRows(auth).filter((row) => {
        if (query.typeId && row.typeId !== query.typeId) return false
        if (query.state && row.state !== query.state) return false
        if (
          query.q &&
          !includesTr(`${row.name} ${row.employeeNumber}`, query.q)
        )
          return false
        if (query.locationId || query.orgUnitId) {
          const person = db.personnel.findById(row.personnelId)
          const labels = locationLabels(person?.homeLocationId ?? null)
          if (query.locationId && person?.homeLocationId !== query.locationId)
            return false
          if (query.orgUnitId && labels.orgUnitId !== query.orgUnitId)
            return false
        }
        return true
      })
      // Önce en acil: hiç almamış ve gecikmiş, sonra vade tarihi
      const rank = { never: 0, overdue: 1, expiring: 2, valid: 3 }
      rows.sort(
        (a, b) =>
          rank[a.state] - rank[b.state] ||
          (a.dueAt ?? "").localeCompare(b.dueAt ?? "") ||
          a.name.localeCompare(b.name, "tr")
      )
      return ok(paginate(rows, query.page, query.pageSize))
    })
  ),
  http.get(
    apiPath("/ohs/training-candidates"),
    withAuth("ohs:read", ({ request, auth }) => {
      const query = parseQuery(
        request,
        z.object({
          typeId: z.string().min(1),
          locationId: z.string().min(1).optional().catch(undefined),
          q: z.string().trim().min(1).optional().catch(undefined),
        })
      )
      const rows = trainingRows(auth).filter(
        (row) =>
          row.typeId === query.typeId &&
          (!query.q ||
            includesTr(`${row.name} ${row.employeeNumber}`, query.q)) &&
          (!query.locationId ||
            db.personnel.findById(row.personnelId)?.homeLocationId ===
              query.locationId)
      )
      const rank = { never: 0, overdue: 1, expiring: 2, valid: 3 }
      rows.sort(
        (a, b) =>
          rank[a.state] - rank[b.state] || a.name.localeCompare(b.name, "tr")
      )
      return ok({
        items: rows.slice(0, 200).map((row) => ({
          personnelId: row.personnelId,
          name: row.name,
          employeeNumber: row.employeeNumber,
          locationName: row.locationName,
          state: row.state,
        })),
      })
    })
  ),
  http.get(
    apiPath("/ohs/certificates"),
    withAuth("ohs:read", ({ request, auth }) => {
      const query = parseQuery(request, certificateListParamsSchema)
      const onDate = today()
      const people = new Map(
        visiblePersonnel(auth).map((person) => [person.id, person])
      )
      const certs = db.certificates.findMany(
        (cert) =>
          cert.tenantId === auth.tenant.slug && people.has(cert.personnelId)
      )
      const current = latestCertificates(certs)
      const items = certs
        .map((cert) => serializeCertificate(cert, current, onDate))
        .filter((cert) => {
          if (query.bucket && cert.bucket !== query.bucket) return false
          if (query.type && cert.type !== query.type) return false
          if (query.personnelId && cert.personnelId !== query.personnelId)
            return false
          if (query.orgUnitId) {
            const person = people.get(cert.personnelId)
            if (
              locationLabels(person?.homeLocationId ?? null).orgUnitId !==
              query.orgUnitId
            )
              return false
          }
          if (
            query.q &&
            !includesTr(
              `${cert.personnelName} ${cert.employeeNumber} ${cert.number}`,
              query.q
            )
          )
            return false
          return true
        })
      const direction = query.order === "desc" ? -1 : 1
      items.sort((a, b) =>
        query.sort === "personnelName"
          ? direction * a.personnelName.localeCompare(b.personnelName, "tr")
          : direction *
            (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999")
      )
      return ok(paginate(items, query.page, query.pageSize))
    })
  ),
  http.get(
    apiPath("/ohs/certificates/summary"),
    withAuth("ohs:read", ({ auth }) => ok(certificateSummary(auth)))
  ),
  http.post(
    apiPath("/ohs/certificates"),
    withAuth("ohs:write", async ({ request, auth }) => {
      const body = await parseBody(request, certificateInputSchema)
      if (!body.success) return body.response
      const person = db.personnel.findById(body.data.personnelId)
      if (!person || !createScope(auth).personnel(person))
        return problem(422, "VALIDATION_FAILED", "Personel bulunamadı.", {
          personnelId: ["Personel bulunamadı"],
        })
      if (body.data.uploadId) {
        const upload = db.uploads.findById(body.data.uploadId)
        if (upload?.tenantId !== auth.tenant.slug)
          return problem(422, "VALIDATION_FAILED", "Belge bulunamadı.", {
            uploadId: ["Belge bulunamadı"],
          })
      }
      const cert = db.certificates.insert({
        id: newId("cert"),
        tenantId: auth.tenant.slug,
        ...body.data,
        createdAt: mockClock.now().toISOString(),
      })
      audit(auth, {
        action: "Sertifika kaydedildi",
        targetType: "certificate",
        targetLabel: `${personName(person)} · ${CERTIFICATE_LABELS[cert.type]}`,
        details: cert.expiresAt
          ? `Bitiş ${formatDate(cert.expiresAt)}`
          : "Süresiz",
      })
      const current = latestCertificates(personCertificates(person.id))
      return created(serializeCertificate(cert, current, today()))
    })
  ),
  http.get(
    apiPath("/ohs/personnel/:id"),
    withAuth("ohs:read", ({ params, auth }) => {
      const person = db.personnel.findById(String(params.id))
      if (!person || !createScope(auth).personnel(person)) return notFound()
      return ok(personnelOhs(person, auth))
    })
  ),
  http.get(
    apiPath("/ohs/audit-pack/:locationId"),
    withAuth("ohs:read", ({ params, auth }) => {
      const location = db.locations.findById(String(params.locationId))
      if (!location || !createScope(auth).location(location)) return notFound()
      return ok(buildAuditPack(auth, location))
    })
  ),
  http.get(
    apiPath("/ohs/audit-pack/:locationId/export"),
    withAuth("ohs:read", ({ params, auth }) => {
      const location = db.locations.findById(String(params.locationId))
      if (!location || !createScope(auth).location(location)) return notFound()
      const pack = buildAuditPack(auth, location)
      audit(auth, {
        action: "İSG denetim paketi indirildi",
        targetType: "audit_pack",
        targetLabel: location.name,
        details: `${pack.summary.compliant}/${pack.summary.total} uygun`,
      })
      return fileResponse(
        auditPackWorkbook(pack),
        `isg-denetim-paketi-${location.code}-${pack.date}.xlsx`,
        XLSX_TYPE
      )
    })
  ),
  http.get(
    apiPath("/portal/audit-pack/locations"),
    withAuth("portal:audit_pack", ({ auth }) => {
      const scope = createScope(auth)
      return ok({
        items: db.locations
          .findMany(
            (location) =>
              scope.location(location) && location.status === "active"
          )
          .sort((a, b) => a.name.localeCompare(b.name, "tr"))
          .map((location) => ({
            value: location.id,
            label: location.name,
            description: location.code,
          })),
      })
    })
  ),
  http.get(
    apiPath("/portal/audit-pack/:locationId"),
    withAuth("portal:audit_pack", ({ params, auth }) => {
      const location = db.locations.findById(String(params.locationId))
      if (!location || !createScope(auth).location(location)) return notFound()
      return ok(buildAuditPack(auth, location))
    })
  ),
  http.get(
    apiPath("/portal/audit-pack/:locationId/export"),
    withAuth("portal:audit_pack", ({ params, auth }) => {
      const location = db.locations.findById(String(params.locationId))
      if (!location || !createScope(auth).location(location)) return notFound()
      const pack = buildAuditPack(auth, location)
      audit(auth, {
        action: "İSG denetim paketi indirildi (portal)",
        targetType: "audit_pack",
        targetLabel: location.name,
        details: `${pack.summary.compliant}/${pack.summary.total} uygun`,
      })
      return fileResponse(
        auditPackWorkbook(pack),
        `isg-denetim-paketi-${location.code}-${pack.date}.xlsx`,
        XLSX_TYPE
      )
    })
  ),
]
