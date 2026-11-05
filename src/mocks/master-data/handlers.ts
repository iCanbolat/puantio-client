import { http } from "msw"
import { z } from "zod"

import {
  customerInputSchema,
  customerListParamsSchema,
  CUSTOMER_SORTABLE_FIELDS,
} from "@/entities/customer"
import { legalEntityInputSchema } from "@/entities/legal-entity"
import {
  areaInputSchema,
  createLocationInputSchema,
  locationListParamsSchema,
  LOCATION_SORTABLE_FIELDS,
  nfcUidSchema,
} from "@/entities/location"
import { descendantIds, orgUnitInputSchema } from "@/entities/org-unit"
import {
  PERSONNEL_SORTABLE_FIELDS,
  personnelInputSchema,
  personnelListParamsSchema,
} from "@/entities/personnel"
import { includesTr } from "@/shared/lib/format"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db, newId } from "../db"
import type { MockLocation, MockPersonnel } from "../db/types"
import { fakeQrToken } from "../factories/identity"
import {
  apiPath,
  created,
  noContent,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import {
  activeTag,
  serializeArea,
  serializeCustomer,
  serializeLegalEntity,
  serializeLocation,
  serializeOrgUnit,
  serializePersonnel,
  serializePersonnelDetail,
  serializeTag,
} from "./serializers"

const fieldError = (field: string, message: string) =>
  problem(422, "VALIDATION_FAILED", "Formda hatalı alanlar var.", {
    [field]: [message],
  })

const now = () => mockClock.now().toISOString()

function unitsInScope(tenantId: string, orgUnitId: string | undefined) {
  if (!orgUnitId) return null
  const units = db.orgUnits.findMany((unit) => unit.tenantId === tenantId)
  return descendantIds(units, orgUnitId)
}

function issueQr(
  auth: AuthContext,
  target: {
    targetType: "location" | "area"
    targetId: string
    locationId: string
  }
) {
  const previous = activeTag(target.targetId, "qr")
  if (previous)
    db.tags.update(previous.id, { status: "revoked", revokedAt: now() })
  return db.tags.insert({
    id: newId("tag"),
    tenantId: auth.tenant.slug,
    ...target,
    kind: "qr",
    value: fakeQrToken(),
    status: "active",
    createdAt: now(),
    revokedAt: null,
  })
}

function resolveTarget(
  auth: AuthContext,
  targetType: "location" | "area",
  targetId: string
): { locationId: string; label: string } | null {
  const scope = createScope(auth)
  if (targetType === "location") {
    const location = db.locations.findById(targetId)
    if (!location || !scope.location(location)) return null
    return {
      locationId: location.id,
      label: `${location.code} · ${location.name}`,
    }
  }
  const area = db.areas.findById(targetId)
  const location = area ? db.locations.findById(area.locationId) : undefined
  if (!area || !location || !scope.location(location)) return null
  return { locationId: location.id, label: `${location.code} · ${area.name}` }
}

// --- Tüzel kişilik ve organizasyon ------------------------------------------
const organizationHandlers = [
  http.get(
    apiPath("/legal-entities"),
    withAuth(null, ({ auth }) =>
      ok({
        items: db.legalEntities
          .findMany((entity) => entity.tenantId === auth.tenant.slug)
          .map(serializeLegalEntity),
      })
    )
  ),
  http.post(
    apiPath("/legal-entities"),
    withAuth("org:write", async ({ request, auth }) => {
      const body = await parseBody(request, legalEntityInputSchema)
      if (!body.success) return body.response
      if (
        db.legalEntities.findFirst(
          (entity) =>
            entity.tenantId === auth.tenant.slug &&
            entity.taxNumber === body.data.taxNumber
        )
      )
        return fieldError(
          "taxNumber",
          "Bu VKN ile bir tüzel kişilik zaten var."
        )
      const entity = db.legalEntities.insert({
        id: newId("le"),
        tenantId: auth.tenant.slug,
        ...body.data,
        createdAt: now(),
        payrollProfileId: null,
      })
      audit(auth, {
        action: "Tüzel kişilik eklendi",
        targetType: "legal_entity",
        targetLabel: entity.title,
      })
      return created(serializeLegalEntity(entity))
    })
  ),
  http.patch(
    apiPath("/legal-entities/:id"),
    withAuth("org:write", async ({ request, params, auth }) => {
      const entity = db.legalEntities.findById(String(params.id))
      if (!entity || entity.tenantId !== auth.tenant.slug) return notFound()
      const body = await parseBody(request, legalEntityInputSchema)
      if (!body.success) return body.response
      if (
        db.legalEntities.findFirst(
          (other) =>
            other.tenantId === auth.tenant.slug &&
            other.id !== entity.id &&
            other.taxNumber === body.data.taxNumber
        )
      )
        return fieldError(
          "taxNumber",
          "Bu VKN ile bir tüzel kişilik zaten var."
        )
      const updated = db.legalEntities.update(entity.id, body.data)!
      audit(auth, {
        action: "Tüzel kişilik güncellendi",
        targetType: "legal_entity",
        targetLabel: updated.title,
      })
      return ok(serializeLegalEntity(updated))
    })
  ),

  http.get(
    apiPath("/org-units"),
    withAuth(null, ({ auth }) =>
      ok({
        items: db.orgUnits
          .findMany((unit) => unit.tenantId === auth.tenant.slug)
          .map(serializeOrgUnit),
      })
    )
  ),
  http.post(
    apiPath("/org-units"),
    withAuth("org:write", async ({ request, auth }) => {
      const body = await parseBody(request, orgUnitInputSchema)
      if (!body.success) return body.response
      const levels = auth.tenant.terminology.orgLevels.length
      if (body.data.level >= levels)
        return fieldError("level", "Bu firmada bu seviye tanımlı değil.")
      if (
        db.orgUnits.findFirst(
          (unit) =>
            unit.tenantId === auth.tenant.slug && unit.code === body.data.code
        )
      )
        return fieldError("code", "Bu kod kullanılıyor.")
      if (body.data.parentId) {
        const parent = db.orgUnits.findById(body.data.parentId)
        if (
          !parent ||
          parent.tenantId !== auth.tenant.slug ||
          parent.level !== body.data.level - 1
        )
          return fieldError("parentId", "Geçersiz üst birim.")
      }
      const unit = db.orgUnits.insert({
        id: newId("ou"),
        tenantId: auth.tenant.slug,
        ...body.data,
        parentId: body.data.level === 0 ? null : body.data.parentId,
        cities: [],
      })
      audit(auth, {
        action: "Organizasyon birimi eklendi",
        targetType: "org_unit",
        targetLabel: unit.name,
      })
      return created(serializeOrgUnit(unit))
    })
  ),
  http.patch(
    apiPath("/org-units/:id"),
    withAuth("org:write", async ({ request, params, auth }) => {
      const unit = db.orgUnits.findById(String(params.id))
      if (!unit || unit.tenantId !== auth.tenant.slug) return notFound()
      const body = await parseBody(request, orgUnitInputSchema)
      if (!body.success) return body.response
      if (
        db.orgUnits.findFirst(
          (other) =>
            other.tenantId === auth.tenant.slug &&
            other.id !== unit.id &&
            other.code === body.data.code
        )
      )
        return fieldError("code", "Bu kod kullanılıyor.")
      const updated = db.orgUnits.update(unit.id, {
        code: body.data.code,
        name: body.data.name,
        isActive: body.data.isActive,
        parentId: unit.level === 0 ? null : body.data.parentId,
      })!
      return ok(serializeOrgUnit(updated))
    })
  ),
  http.delete(
    apiPath("/org-units/:id"),
    withAuth("org:write", ({ params, auth }) => {
      const unit = db.orgUnits.findById(String(params.id))
      if (!unit || unit.tenantId !== auth.tenant.slug) return notFound()
      if (db.orgUnits.count((other) => other.parentId === unit.id) > 0)
        return problem(
          409,
          "HAS_CHILDREN",
          "Alt birimleri olan birim silinemez."
        )
      if (db.locations.count((location) => location.orgUnitId === unit.id) > 0)
        return problem(
          409,
          "HAS_LOCATIONS",
          "Bu birime bağlı lokasyonlar var; önce taşıyın."
        )
      db.orgUnits.remove(unit.id)
      audit(auth, {
        action: "Organizasyon birimi silindi",
        targetType: "org_unit",
        targetLabel: unit.name,
      })
      return noContent()
    })
  ),
]

// --- Müşteriler -------------------------------------------------------------
const customerHandlers = [
  http.get(
    apiPath("/customers"),
    withAuth("customer:read", ({ request, auth }) => {
      const params = parseQuery(request, customerListParamsSchema)
      const scope = createScope(auth)
      const page = db.customers.query(params, {
        where: (customer) =>
          scope.customer(customer) &&
          (!params.type || customer.type === params.type) &&
          (!params.sector || customer.sector === params.sector) &&
          (!params.status || customer.status === params.status),
        searchFields: ["code", "name", "taxNumber"],
        sortableFields: CUSTOMER_SORTABLE_FIELDS.filter(
          (field) => field !== "locationCount"
        ),
        defaultSort: { field: "name", order: "asc" },
      })
      return ok({ items: page.items.map(serializeCustomer), meta: page.meta })
    })
  ),
  http.get(
    apiPath("/customers/options"),
    withAuth(null, ({ request, auth }) => {
      const { q } = parseQuery(request, z.object({ q: z.string().optional() }))
      const scope = createScope(auth)
      const items = db.customers
        .findMany(
          (customer) =>
            scope.customer(customer) && (!q || includesTr(customer.name, q))
        )
        .slice(0, 20)
        .map((customer) => ({
          value: customer.id,
          label: customer.name,
          description: customer.code,
        }))
      return ok({ items })
    })
  ),
  http.get(
    apiPath("/customers/:id"),
    withAuth("customer:read", ({ params, auth }) => {
      const customer = db.customers.findById(String(params.id))
      if (!customer || !createScope(auth).customer(customer)) return notFound()
      return ok(serializeCustomer(customer))
    })
  ),
  http.post(
    apiPath("/customers"),
    withAuth("customer:write", async ({ request, auth }) => {
      const body = await parseBody(request, customerInputSchema)
      if (!body.success) return body.response
      const count = db.customers.count(
        (customer) => customer.tenantId === auth.tenant.slug
      )
      const customer = db.customers.insert({
        id: newId("cus"),
        tenantId: auth.tenant.slug,
        code: `MUS-${String(count + 1).padStart(4, "0")}`,
        ...body.data,
        updatedAt: now(),
      })
      audit(auth, {
        action: "Müşteri eklendi",
        targetType: "customer",
        targetLabel: customer.name,
      })
      return created(serializeCustomer(customer))
    })
  ),
  http.patch(
    apiPath("/customers/:id"),
    withAuth("customer:write", async ({ request, params, auth }) => {
      const customer = db.customers.findById(String(params.id))
      if (!customer || customer.tenantId !== auth.tenant.slug) return notFound()
      const body = await parseBody(request, customerInputSchema)
      if (!body.success) return body.response
      const updated = db.customers.update(customer.id, {
        ...body.data,
        updatedAt: now(),
      })!
      return ok(serializeCustomer(updated))
    })
  ),
]

// --- Lokasyonlar, alanlar, etiketler -----------------------------------------
function locationFilter(
  auth: AuthContext,
  params: {
    orgUnitId?: string | undefined
    customerId?: string | undefined
    status?: string | undefined
    serviceLine?: string | undefined
    q?: string | undefined
  }
) {
  const scope = createScope(auth)
  const units = unitsInScope(auth.tenant.slug, params.orgUnitId)
  return (location: MockLocation) =>
    scope.location(location) &&
    (!units || units.has(location.orgUnitId)) &&
    (!params.customerId || location.customerId === params.customerId) &&
    (!params.status || location.status === params.status) &&
    (!params.serviceLine ||
      location.serviceLines.includes(params.serviceLine as never))
}

function validateLocationRefs(
  auth: AuthContext,
  body: { customerId: string; orgUnitId: string }
) {
  const customer = db.customers.findById(body.customerId)
  if (!customer || customer.tenantId !== auth.tenant.slug)
    return fieldError("customerId", "Müşteri bulunamadı.")
  const unit = db.orgUnits.findById(body.orgUnitId)
  const leaf = auth.tenant.terminology.orgLevels.length - 1
  if (!unit || unit.tenantId !== auth.tenant.slug)
    return fieldError("orgUnitId", "Birim bulunamadı.")
  if (unit.level !== leaf)
    return fieldError(
      "orgUnitId",
      "Lokasyon en alt seviyedeki birime bağlanmalı."
    )
  return null
}

const locationHandlers = [
  http.get(
    apiPath("/locations"),
    withAuth("location:read", ({ request, auth }) => {
      const params = parseQuery(request, locationListParamsSchema)
      const page = db.locations.query(params, {
        where: locationFilter(auth, params),
        searchFields: ["code", "name"],
        sortableFields: LOCATION_SORTABLE_FIELDS.filter(
          (field) => field !== "customerName"
        ),
        defaultSort: { field: "code", order: "asc" },
      })
      return ok({ items: page.items.map(serializeLocation), meta: page.meta })
    })
  ),
  http.get(
    apiPath("/locations/map-points"),
    withAuth("location:read", ({ request, auth }) => {
      const params = parseQuery(request, locationListParamsSchema)
      const where = locationFilter(auth, params)
      const items = db.locations
        .findMany(
          (location) =>
            where(location) &&
            (!params.q ||
              includesTr(`${location.code} ${location.name}`, params.q))
        )
        .map((location) => ({
          id: location.id,
          code: location.code,
          name: location.name,
          lat: location.geofence.center.lat,
          lng: location.geofence.center.lng,
        }))
      return ok({ items })
    })
  ),
  http.get(
    apiPath("/locations/options"),
    withAuth(null, ({ request, auth }) => {
      const { q } = parseQuery(request, z.object({ q: z.string().optional() }))
      const scope = createScope(auth)
      const items = db.locations
        .findMany(
          (location) =>
            scope.location(location) &&
            location.status === "active" &&
            (!q || includesTr(`${location.code} ${location.name}`, q))
        )
        .slice(0, 20)
        .map((location) => ({
          value: location.id,
          label: `${location.code} · ${location.name}`,
          description: location.address.city,
        }))
      return ok({ items })
    })
  ),
  http.get(
    apiPath("/locations/:id"),
    withAuth("location:read", ({ params, auth }) => {
      const location = db.locations.findById(String(params.id))
      if (!location || !createScope(auth).location(location)) return notFound()
      return ok(serializeLocation(location))
    })
  ),
  http.post(
    apiPath("/locations"),
    withAuth("location:write", async ({ request, auth }) => {
      const body = await parseBody(
        request,
        createLocationInputSchema(auth.tenant.rules.geofence)
      )
      if (!body.success) return body.response
      const refError = validateLocationRefs(auth, body.data)
      if (refError) return refError
      if (
        db.locations.findFirst(
          (location) =>
            location.tenantId === auth.tenant.slug &&
            location.code === body.data.code
        )
      )
        return fieldError("code", "Bu kod başka bir kayıtta kullanılıyor.")
      const location = db.locations.insert({
        id: newId("loc"),
        tenantId: auth.tenant.slug,
        ...body.data,
        updatedAt: now(),
      })
      issueQr(auth, {
        targetType: "location",
        targetId: location.id,
        locationId: location.id,
      })
      audit(auth, {
        action: "Lokasyon eklendi",
        targetType: "location",
        targetLabel: location.code,
      })
      return created(serializeLocation(location))
    })
  ),
  http.patch(
    apiPath("/locations/:id"),
    withAuth("location:write", async ({ request, params, auth }) => {
      const location = db.locations.findById(String(params.id))
      if (!location || !createScope(auth).location(location)) return notFound()
      const body = await parseBody(
        request,
        createLocationInputSchema(auth.tenant.rules.geofence)
      )
      if (!body.success) return body.response
      const refError = validateLocationRefs(auth, body.data)
      if (refError) return refError
      if (
        db.locations.findFirst(
          (other) =>
            other.tenantId === auth.tenant.slug &&
            other.id !== location.id &&
            other.code === body.data.code
        )
      )
        return fieldError("code", "Bu kod başka bir kayıtta kullanılıyor.")
      const updated = db.locations.update(location.id, {
        ...body.data,
        updatedAt: now(),
      })!
      return ok(serializeLocation(updated))
    })
  ),
  http.get(
    apiPath("/locations/:id/areas"),
    withAuth("location:read", ({ params, auth }) => {
      const location = db.locations.findById(String(params.id))
      if (!location || !createScope(auth).location(location)) return notFound()
      return ok({
        items: db.areas
          .findMany((area) => area.locationId === location.id)
          .map(serializeArea),
      })
    })
  ),
  http.post(
    apiPath("/locations/:id/areas"),
    withAuth("location:write", async ({ request, params, auth }) => {
      const location = db.locations.findById(String(params.id))
      if (!location || !createScope(auth).location(location)) return notFound()
      const body = await parseBody(request, areaInputSchema)
      if (!body.success) return body.response
      const area = db.areas.insert({
        id: newId("area"),
        tenantId: auth.tenant.slug,
        locationId: location.id,
        ...body.data,
      })
      issueQr(auth, {
        targetType: "area",
        targetId: area.id,
        locationId: location.id,
      })
      return created(serializeArea(area))
    })
  ),
  http.patch(
    apiPath("/areas/:id"),
    withAuth("location:write", async ({ request, params, auth }) => {
      const area = db.areas.findById(String(params.id))
      if (!area || !resolveTarget(auth, "area", area.id)) return notFound()
      const body = await parseBody(request, areaInputSchema)
      if (!body.success) return body.response
      return ok(serializeArea(db.areas.update(area.id, body.data)!))
    })
  ),
  http.get(
    apiPath("/locations/:id/tags"),
    withAuth("location:read", ({ params, auth }) => {
      const location = db.locations.findById(String(params.id))
      if (!location || !createScope(auth).location(location)) return notFound()
      const items = db.tags
        .findMany((tag) => tag.locationId === location.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(serializeTag)
      return ok({ items })
    })
  ),
  http.post(
    apiPath("/tags/qr"),
    withAuth("location:tags", async ({ request, auth }) => {
      const body = await parseBody(
        request,
        z.object({
          targetType: z.enum(["location", "area"]),
          targetId: z.string(),
        })
      )
      if (!body.success) return body.response
      const target = resolveTarget(
        auth,
        body.data.targetType,
        body.data.targetId
      )
      if (!target) return notFound()
      const tag = issueQr(auth, { ...body.data, locationId: target.locationId })
      audit(auth, {
        action: "QR etiketi yeniden üretildi",
        targetType: body.data.targetType,
        targetLabel: target.label,
        details: "Önceki etiket iptal edildi",
      })
      return created(serializeTag(tag))
    })
  ),
  http.post(
    apiPath("/tags/nfc"),
    withAuth("location:tags", async ({ request, auth }) => {
      const body = await parseBody(
        request,
        z.object({
          targetType: z.enum(["location", "area"]),
          targetId: z.string(),
          value: nfcUidSchema,
        })
      )
      if (!body.success) return body.response
      const target = resolveTarget(
        auth,
        body.data.targetType,
        body.data.targetId
      )
      if (!target) return notFound()
      const taken = db.tags.findFirst(
        (tag) =>
          tag.tenantId === auth.tenant.slug &&
          tag.kind === "nfc" &&
          tag.status === "active" &&
          tag.value === body.data.value &&
          tag.targetId !== body.data.targetId
      )
      if (taken)
        return fieldError("value", "Bu NFC etiketi başka bir kayda atanmış.")
      const previous = activeTag(body.data.targetId, "nfc")
      if (previous)
        db.tags.update(previous.id, { status: "revoked", revokedAt: now() })
      const tag = db.tags.insert({
        id: newId("tag"),
        tenantId: auth.tenant.slug,
        targetType: body.data.targetType,
        targetId: body.data.targetId,
        locationId: target.locationId,
        kind: "nfc",
        value: body.data.value,
        status: "active",
        createdAt: now(),
        revokedAt: null,
      })
      audit(auth, {
        action: "NFC etiketi atandı",
        targetType: body.data.targetType,
        targetLabel: target.label,
        details: body.data.value,
      })
      return created(serializeTag(tag))
    })
  ),
  http.get(
    apiPath("/tags/labels"),
    withAuth("location:read", ({ request, auth }) => {
      const url = new URL(request.url)
      const ids = url.searchParams.getAll("locationId")
      const scope = createScope(auth)
      const items = ids.flatMap((id) => {
        const location = db.locations.findById(id)
        if (!location || !scope.location(location)) return []
        const locationTag = activeTag(location.id, "qr")
        const labels = locationTag
          ? [
              {
                locationCode: location.code,
                locationName: location.name,
                areaName: null,
                token: locationTag.value,
              },
            ]
          : []
        for (const area of db.areas.findMany(
          (item) => item.locationId === location.id
        )) {
          const tag = activeTag(area.id, "qr")
          if (tag)
            labels.push({
              locationCode: location.code,
              locationName: location.name,
              areaName: area.name,
              token: tag.value,
            } as never)
        }
        return labels
      })
      return ok({ items })
    })
  ),
]

// --- Personel ----------------------------------------------------------------
function personnelWhere(
  auth: AuthContext,
  params: {
    orgUnitId?: string | undefined
    locationId?: string | undefined
    status?: string | undefined
    position?: string | undefined
    legalEntityId?: string | undefined
    q?: string | undefined
  }
) {
  const scope = createScope(auth)
  const units = unitsInScope(auth.tenant.slug, params.orgUnitId)
  const unitLocations = units
    ? new Set(
        db.locations
          .findMany(
            (location) =>
              location.tenantId === auth.tenant.slug &&
              units.has(location.orgUnitId)
          )
          .map((location) => location.id)
      )
    : null
  return (person: MockPersonnel) =>
    scope.personnel(person) &&
    (!unitLocations ||
      (person.homeLocationId !== null &&
        unitLocations.has(person.homeLocationId))) &&
    (!params.locationId || person.homeLocationId === params.locationId) &&
    (!params.status || person.status === params.status) &&
    (!params.position || person.position === params.position) &&
    (!params.legalEntityId || person.legalEntityId === params.legalEntityId) &&
    (!params.q ||
      includesTr(`${person.firstName} ${person.lastName}`, params.q) ||
      includesTr(person.employeeNumber, params.q))
}

function validatePersonnel(
  auth: AuthContext,
  body: {
    tckn: string
    employeeNumber: string
    legalEntityId: string
    homeLocationId: string | null
  },
  selfId: string | null
) {
  const entity = db.legalEntities.findById(body.legalEntityId)
  if (!entity || entity.tenantId !== auth.tenant.slug)
    return fieldError("legalEntityId", "Tüzel kişilik bulunamadı.")
  if (body.homeLocationId && !createScope(auth).locationId(body.homeLocationId))
    return fieldError(
      "homeLocationId",
      "Lokasyon bulunamadı veya kapsamınız dışında."
    )
  const sameTenant = (person: MockPersonnel) =>
    person.tenantId === auth.tenant.slug && person.id !== selfId
  const tcknOwner = db.personnel.findFirst(
    (person) => sameTenant(person) && person.tckn === body.tckn
  )
  if (tcknOwner)
    return fieldError(
      "tckn",
      `Bu T.C. Kimlik No ${tcknOwner.employeeNumber} sicil numaralı personelde kayıtlı.`
    )
  if (
    db.personnel.findFirst(
      (person) =>
        sameTenant(person) && person.employeeNumber === body.employeeNumber
    )
  )
    return fieldError("employeeNumber", "Bu sicil numarası kullanılıyor.")
  return null
}

const personnelHandlers = [
  http.get(
    apiPath("/personnel"),
    withAuth("personnel:read", ({ request, auth }) => {
      const params = parseQuery(request, personnelListParamsSchema)
      const page = db.personnel.query(
        { ...params, q: undefined },
        {
          where: personnelWhere(auth, params),
          sortableFields: PERSONNEL_SORTABLE_FIELDS,
          defaultSort: { field: "employeeNumber", order: "asc" },
        }
      )
      return ok({ items: page.items.map(serializePersonnel), meta: page.meta })
    })
  ),
  http.get(
    apiPath("/personnel/options"),
    withAuth(null, ({ request, auth }) => {
      const { q, floater } = parseQuery(
        request,
        z.object({ q: z.string().optional(), floater: z.string().optional() })
      )
      const scope = createScope(auth)
      const items = db.personnel
        .findMany(
          (person) =>
            scope.personnel(person) &&
            person.status === "active" &&
            (floater !== "true" || person.isFloater) &&
            (!q ||
              includesTr(
                `${person.employeeNumber} ${person.firstName} ${person.lastName}`,
                q
              ))
        )
        .slice(0, 20)
        .map((person) => ({
          value: person.id,
          label: `${person.firstName} ${person.lastName}`,
          description: `${person.employeeNumber}${person.isFloater ? " · Yedek havuzu" : ""}`,
        }))
      return ok({ items })
    })
  ),
  http.get(
    apiPath("/personnel/:id"),
    withAuth("personnel:read", ({ params, auth }) => {
      const person = db.personnel.findById(String(params.id))
      if (!person || !createScope(auth).personnel(person)) return notFound()
      return ok(
        serializePersonnelDetail(
          person,
          auth.permissions.has("personnel:write")
        )
      )
    })
  ),
  http.post(
    apiPath("/personnel"),
    withAuth("personnel:write", async ({ request, auth }) => {
      const body = await parseBody(request, personnelInputSchema)
      if (!body.success) return body.response
      const error = validatePersonnel(auth, body.data, null)
      if (error) return error
      const person = db.personnel.insert({
        id: newId("per"),
        tenantId: auth.tenant.slug,
        ...body.data,
        updatedAt: now(),
      })
      audit(auth, {
        action: "Personel eklendi",
        targetType: "personnel",
        targetLabel: person.employeeNumber,
      })
      return created(serializePersonnelDetail(person, true))
    })
  ),
  http.patch(
    apiPath("/personnel/:id"),
    withAuth("personnel:write", async ({ request, params, auth }) => {
      const person = db.personnel.findById(String(params.id))
      if (!person || !createScope(auth).personnel(person)) return notFound()
      const body = await parseBody(request, personnelInputSchema)
      if (!body.success) return body.response
      const error = validatePersonnel(auth, body.data, person.id)
      if (error) return error
      const updated = db.personnel.update(person.id, {
        ...body.data,
        updatedAt: now(),
      })!
      return ok(serializePersonnelDetail(updated, true))
    })
  ),
]

export const masterDataHandlers = [
  ...organizationHandlers,
  ...customerHandlers,
  ...locationHandlers,
  ...personnelHandlers,
]
