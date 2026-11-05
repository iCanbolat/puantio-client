import { http } from "msw"
import { z } from "zod"

import {
  buildImportDefinitions,
  importEntitySchema,
} from "@/features/master-data-import/model/import-definitions"
import { compareTr } from "@/shared/lib/format"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import { fakeQrToken } from "../factories/identity"
import { apiPath, ok, parseBody, problem } from "../http"

const now = () => mockClock.now().toISOString()

function definitionsFor(auth: AuthContext) {
  const terms = auth.tenant.terminology
  return buildImportDefinitions({
    location: terms.location.singular,
    orgLevel: terms.orgLevels[terms.orgLevels.length - 1]?.singular ?? "Bölge",
  })
}

function findExisting(auth: AuthContext, entity: string, key: string) {
  const tenantId = auth.tenant.slug
  switch (entity) {
    case "personnel": {
      const person = db.personnel.findFirst(
        (item) => item.tenantId === tenantId && item.tckn === key
      )
      return person
        ? {
            id: person.id,
            label: `${person.employeeNumber} · ${person.firstName} ${person.lastName}`,
          }
        : null
    }
    case "locations": {
      const location = db.locations.findFirst(
        (item) => item.tenantId === tenantId && item.code === key
      )
      return location
        ? { id: location.id, label: `${location.code} · ${location.name}` }
        : null
    }
    case "customers": {
      const customer = db.customers.findFirst(
        (item) => item.tenantId === tenantId && item.taxNumber === key
      )
      return customer ? { id: customer.id, label: customer.name } : null
    }
    default: {
      const entityRecord = db.legalEntities.findFirst(
        (item) => item.tenantId === tenantId && item.taxNumber === key
      )
      return entityRecord
        ? { id: entityRecord.id, label: entityRecord.title }
        : null
    }
  }
}

const permissionFor = (entity: string) =>
  entity === "personnel"
    ? "personnel:write"
    : entity === "locations"
      ? "location:write"
      : entity === "customers"
        ? "customer:write"
        : "org:write"

type Row = Record<string, unknown>

function importRow(
  auth: AuthContext,
  entity: string,
  row: Row,
  existingId: string | null
): string | null {
  const tenantId = auth.tenant.slug
  const scope = createScope(auth)
  if (entity === "personnel") {
    const legal = db.legalEntities.findFirst(
      (item) =>
        item.tenantId === tenantId &&
        item.taxNumber === row.legalEntityTaxNumber
    )
    if (!legal)
      return "İşveren VKN'si firmada tanımlı bir tüzel kişiliğe ait değil"
    let homeLocationId: string | null = null
    if (typeof row.homeLocationCode === "string") {
      const location = db.locations.findFirst(
        (item) =>
          item.tenantId === tenantId && item.code === row.homeLocationCode
      )
      if (!location || !scope.location(location))
        return "Lokasyon kodu bulunamadı"
      homeLocationId = location.id
    }
    const employeeTaken = db.personnel.findFirst(
      (item) =>
        item.tenantId === tenantId &&
        item.employeeNumber === row.employeeNumber &&
        item.id !== existingId
    )
    if (employeeTaken) return "Sicil numarası başka bir personelde kullanılıyor"
    const data = {
      employeeNumber: String(row.employeeNumber),
      firstName: String(row.firstName),
      lastName: String(row.lastName),
      tckn: String(row.tckn),
      phone: (row.phone as string | null) ?? null,
      position: row.position as never,
      serviceLine: row.serviceLine as never,
      legalEntityId: legal.id,
      homeLocationId,
      isFloater: Boolean(row.isFloater),
      hireDate: String(row.hireDate),
      updatedAt: now(),
    }
    if (existingId) db.personnel.update(existingId, data)
    else
      db.personnel.insert({
        id: newId("per"),
        tenantId,
        status: "active",
        terminationDate: null,
        ...data,
      })
    return null
  }
  if (entity === "locations") {
    const unit = db.orgUnits.findFirst(
      (item) => item.tenantId === tenantId && item.code === row.orgUnitCode
    )
    const leaf = auth.tenant.terminology.orgLevels.length - 1
    if (!unit || unit.level !== leaf)
      return "Birim kodu bulunamadı veya en alt seviyede değil"
    const customer = db.customers.findFirst(
      (item) =>
        item.tenantId === tenantId &&
        compareTr(item.name, String(row.customerName)) === 0
    )
    if (!customer) return "Müşteri bulunamadı (önce müşterileri içe aktarın)"
    const limits = auth.tenant.rules.geofence
    const radius =
      typeof row.radiusMeters === "number" ? row.radiusMeters : limits.default
    if (radius < limits.min || radius > limits.max)
      return `Geofence yarıçapı ${limits.min}–${limits.max} m aralığında olmalı`
    const data = {
      code: String(row.code),
      name: String(row.name),
      customerId: customer.id,
      orgUnitId: unit.id,
      address: {
        city: String(row.city),
        district: String(row.district),
        line: String(row.addressLine),
      },
      geofence: {
        center: { lat: Number(row.lat), lng: Number(row.lng) },
        radiusMeters: radius,
      },
      targetHeadcount:
        typeof row.targetHeadcount === "number" ? row.targetHeadcount : 0,
      updatedAt: now(),
    }
    if (existingId) {
      db.locations.update(existingId, data)
    } else {
      const location = db.locations.insert({
        id: newId("loc"),
        tenantId,
        serviceLines: auth.tenant.serviceLines.slice(0, 1),
        workingHours: { days: [1, 2, 3, 4, 5], start: "07:00", end: "19:00" },
        requiredCertificates: [],
        status: "active",
        ...data,
      })
      db.tags.insert({
        id: newId("tag"),
        tenantId,
        targetType: "location",
        targetId: location.id,
        locationId: location.id,
        kind: "qr",
        value: fakeQrToken(),
        status: "active",
        createdAt: now(),
        revokedAt: null,
      })
    }
    return null
  }
  if (entity === "customers") {
    const data = {
      name: String(row.name),
      type: row.type as never,
      sector: row.sector as never,
      taxNumber: (row.taxNumber as string | null) ?? null,
      taxOffice: (row.taxOffice as string | null) ?? null,
      contacts: row.contactName
        ? [
            {
              name: row.contactName as string,
              title: null,
              phone: (row.contactPhone as string | null) ?? null,
              email: (row.contactEmail as string | null) ?? null,
              isPrimary: true,
            },
          ]
        : [],
      updatedAt: now(),
    }
    if (existingId) db.customers.update(existingId, data)
    else {
      const count = db.customers.count((item) => item.tenantId === tenantId)
      db.customers.insert({
        id: newId("cus"),
        tenantId,
        code: `MUS-${String(count + 1).padStart(4, "0")}`,
        status: "active",
        ...data,
      })
    }
    return null
  }
  const data = {
    title: String(row.title),
    taxNumber: String(row.taxNumber),
    taxOffice: String(row.taxOffice),
    sgkWorkplaceNumbers:
      typeof row.sgkWorkplaceNumber === "string"
        ? [row.sgkWorkplaceNumber]
        : [],
  }
  if (existingId) db.legalEntities.update(existingId, data)
  else
    db.legalEntities.insert({
      id: newId("le"),
      tenantId,
      eInvoiceEnabled: false,
      address: null,
      isActive: true,
      createdAt: now(),
      ...data,
    })
  return null
}

export const importHandlers = [
  http.post(apiPath("/import/:entity/check"), async (args) => {
    const entity = importEntitySchema.safeParse(args.params.entity)
    if (!entity.success)
      return problem(404, "NOT_FOUND", "Bilinmeyen içe aktarma türü.")
    return withAuth(permissionFor(entity.data), async ({ request, auth }) => {
      const body = await parseBody(
        request,
        z.object({ keys: z.array(z.string()).max(5000) })
      )
      if (!body.success) return body.response
      const existing = body.data.keys.flatMap((key) => {
        const found = findExisting(auth, entity.data, key)
        return found ? [{ key, label: found.label }] : []
      })
      return ok({ existing })
    })(args)
  }),

  http.post(apiPath("/import/:entity/batch"), async (args) => {
    const entity = importEntitySchema.safeParse(args.params.entity)
    if (!entity.success)
      return problem(404, "NOT_FOUND", "Bilinmeyen içe aktarma türü.")
    return withAuth(permissionFor(entity.data), async ({ request, auth }) => {
      const body = await parseBody(
        request,
        z.object({
          rows: z.array(z.record(z.string(), z.unknown())).max(500),
          duplicateStrategy: z.enum(["update", "skip"]),
        })
      )
      if (!body.success) return body.response
      const definition = definitionsFor(auth)[entity.data]
      const result = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as { index: number; message: string }[],
      }
      body.data.rows.forEach((raw, index) => {
        const parsed = definition.rowSchema.safeParse(raw)
        if (!parsed.success) {
          result.errors.push({
            index,
            message: parsed.error.issues[0]?.message ?? "Geçersiz satır",
          })
          return
        }
        const key = parsed.data[definition.duplicateKey]
        const existing =
          typeof key === "string" ? findExisting(auth, entity.data, key) : null
        if (existing && body.data.duplicateStrategy === "skip") {
          result.skipped += 1
          return
        }
        const error = importRow(
          auth,
          entity.data,
          parsed.data,
          existing?.id ?? null
        )
        if (error) result.errors.push({ index, message: error })
        else if (existing) result.updated += 1
        else result.created += 1
      })
      audit(auth, {
        action: "Excel içe aktarma",
        targetType: entity.data,
        targetLabel: definition.label,
        details: `${result.created} yeni, ${result.updated} güncel, ${result.skipped} atlandı, ${result.errors.length} hata`,
      })
      return ok(result)
    })(args)
  }),
]
