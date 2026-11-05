import type { Area, Location, Tag } from "@/entities/location"
import type { Customer } from "@/entities/customer"
import type { LegalEntity } from "@/entities/legal-entity"
import type { OrgUnit } from "@/entities/org-unit"
import type { Personnel, PersonnelDetail } from "@/entities/personnel"
import { maskTckn } from "@/shared/lib/tckn"
import { maskTrMobile } from "@/shared/lib/phone"

import { db } from "../db"
import type {
  MockArea,
  MockCustomer,
  MockLegalEntity,
  MockLocation,
  MockOrgUnit,
  MockPersonnel,
  MockTag,
} from "../db/types"

export function serializeLegalEntity(entity: MockLegalEntity): LegalEntity {
  const { tenantId: _tenantId, ...rest } = entity
  return {
    ...(rest as Omit<LegalEntity, "personnelCount">),
    personnelCount: db.personnel.count(
      (person) =>
        person.legalEntityId === entity.id && person.status !== "terminated"
    ),
  }
}

export function serializeOrgUnit(unit: MockOrgUnit): OrgUnit {
  const { tenantId: _tenantId, cities: _cities, ...rest } = unit
  return {
    ...(rest as Omit<OrgUnit, "locationCount">),
    locationCount: db.locations.count(
      (location) => location.orgUnitId === unit.id
    ),
  }
}

export function serializeCustomer(customer: MockCustomer): Customer {
  const { tenantId: _tenantId, ...rest } = customer
  return {
    ...(rest as Omit<Customer, "locationCount">),
    locationCount: db.locations.count(
      (location) => location.customerId === customer.id
    ),
  }
}

export function serializeLocation(location: MockLocation): Location {
  const { tenantId: _tenantId, ...rest } = location
  return {
    ...(rest as Omit<Location, "customerName" | "orgUnitName" | "areaCount">),
    customerName: db.customers.findById(location.customerId)?.name ?? "—",
    orgUnitName: db.orgUnits.findById(location.orgUnitId)?.name ?? "—",
    areaCount: db.areas.count((area) => area.locationId === location.id),
  }
}

export function activeTag(targetId: string, kind: "qr" | "nfc") {
  return db.tags.findFirst(
    (tag) =>
      tag.targetId === targetId && tag.kind === kind && tag.status === "active"
  )
}

export function serializeArea(area: MockArea): Area {
  return {
    id: area.id as Area["id"],
    locationId: area.locationId,
    name: area.name,
    type: area.type,
    floor: area.floor,
    qrToken: activeTag(area.id, "qr")?.value ?? null,
    nfcUid: activeTag(area.id, "nfc")?.value ?? null,
  }
}

export function serializeTag(tag: MockTag): Tag {
  return {
    id: tag.id,
    targetType: tag.targetType,
    targetId: tag.targetId,
    kind: tag.kind,
    value: tag.value,
    status: tag.status,
    createdAt: tag.createdAt,
    revokedAt: tag.revokedAt,
  }
}

export function serializePersonnel(person: MockPersonnel): Personnel {
  const location = person.homeLocationId
    ? db.locations.findById(person.homeLocationId)
    : undefined
  const unit = location ? db.orgUnits.findById(location.orgUnitId) : undefined
  return {
    id: person.id as Personnel["id"],
    employeeNumber: person.employeeNumber,
    firstName: person.firstName,
    lastName: person.lastName,
    tcknMasked: maskTckn(person.tckn),
    phoneMasked: person.phone ? maskTrMobile(person.phone) : null,
    position: person.position,
    serviceLine: person.serviceLine,
    legalEntityId: person.legalEntityId,
    legalEntityName:
      db.legalEntities.findById(person.legalEntityId)?.title ?? "—",
    homeLocationId: person.homeLocationId,
    homeLocationName: location ? `${location.code} · ${location.name}` : null,
    orgUnitId: unit?.id ?? null,
    orgUnitName: unit?.name ?? null,
    isFloater: person.isFloater,
    status: person.status,
    hireDate: person.hireDate,
    terminationDate: person.terminationDate,
    updatedAt: person.updatedAt,
  }
}

/** Tam TCKN/telefon yalnızca düzenleme yetkisi olana döner (KVKK: veri minimizasyonu) */
export function serializePersonnelDetail(
  person: MockPersonnel,
  canSeeIdentity: boolean
): PersonnelDetail {
  return {
    ...serializePersonnel(person),
    tckn: canSeeIdentity ? person.tckn : null,
    phone: canSeeIdentity ? person.phone : null,
  }
}
