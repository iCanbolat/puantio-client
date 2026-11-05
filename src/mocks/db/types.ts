import type { AccessScope, Permission } from "@/entities/session"
import type { ServiceLine } from "@/entities/tenant"
import type {
  AreaType,
  CertificateType,
  LocationStatus,
  WorkingHours,
} from "@/entities/location"
import type {
  CustomerContact,
  CustomerSector,
  CustomerStatus,
  CustomerType,
} from "@/entities/customer"
import type { PersonnelStatus, Position } from "@/entities/personnel"
import type { Geofence } from "@/shared/lib/geo"

/**
 * Mock DB kayıt tipleri. Her kayıt `tenantId` taşır (kiracı izolasyonu). Türetilmiş alanlar
 * (sayımlar, ilişkili adlar, maskeler) saklanmaz; yanıt üretilirken hesaplanır.
 */
export interface Tenanted {
  id: string
  tenantId: string
}

export interface MockUser extends Tenanted {
  displayName: string
  email: string
  title: string | null
  roleIds: string[]
  scope: AccessScope
  status: "invited" | "active" | "disabled"
  lastLoginAt: string | null
  invitedAt: string | null
}

export interface MockLegalEntity extends Tenanted {
  title: string
  taxNumber: string
  taxOffice: string
  sgkWorkplaceNumbers: string[]
  eInvoiceEnabled: boolean
  address: string | null
  isActive: boolean
  createdAt: string
}

export interface MockOrgUnit extends Tenanted {
  level: number
  parentId: string | null
  code: string
  name: string
  isActive: boolean
  /** Lokasyon üretimi için (yalnızca mock) */
  cities: string[]
}

export interface MockCustomer extends Tenanted {
  code: string
  name: string
  type: CustomerType
  sector: CustomerSector
  taxNumber: string | null
  taxOffice: string | null
  contacts: CustomerContact[]
  status: CustomerStatus
  updatedAt: string
}

export interface MockLocation extends Tenanted {
  code: string
  name: string
  customerId: string
  orgUnitId: string
  serviceLines: ServiceLine[]
  address: { city: string; district: string; line: string }
  geofence: Geofence
  workingHours: WorkingHours
  targetHeadcount: number
  requiredCertificates: CertificateType[]
  status: LocationStatus
  updatedAt: string
}

export interface MockArea extends Tenanted {
  locationId: string
  name: string
  type: AreaType
  floor: string | null
}

export interface MockTag extends Tenanted {
  targetType: "location" | "area"
  targetId: string
  /** Etiket basımı ve kapsam filtresi için */
  locationId: string
  kind: "qr" | "nfc"
  value: string
  status: "active" | "revoked"
  createdAt: string
  revokedAt: string | null
}

export interface MockPersonnel extends Tenanted {
  employeeNumber: string
  firstName: string
  lastName: string
  tckn: string
  phone: string | null
  position: Position
  serviceLine: ServiceLine
  legalEntityId: string
  homeLocationId: string | null
  isFloater: boolean
  status: PersonnelStatus
  hireDate: string
  terminationDate: string | null
  updatedAt: string
}

export interface MockAuditEvent extends Tenanted {
  occurredAt: string
  actorName: string
  actorKind: "user" | "platform" | "system"
  action: string
  targetType: string
  targetLabel: string
  details: string | null
}

export interface MockSupportSession {
  id: string
  tenantSlug: string
  agentUserId: string
  agentName: string
  reason: string
  startedAt: string
  expiresAt: string
  endedAt: string | null
}

export interface MockPlatformUser {
  id: string
  tenantId: "platform"
  displayName: string
  email: string
  title: string | null
  permissions: Permission[]
}
