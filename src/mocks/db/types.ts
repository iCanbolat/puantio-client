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
  /** Varsayılan bordro aktarım profili */
  payrollProfileId: string | null
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

/* ───────────────────────── Faz 2: vardiya, yoklama, puantaj ───────────────────────── */

export interface MockShiftTemplate extends Tenanted {
  code: string
  name: string
  kind: "standard" | "split" | "rotation"
  segments: { start: string; end: string }[]
  breakMinutes: number
  color: "sky" | "amber" | "indigo" | "emerald" | "rose" | "slate"
  rotation: ({ kind: "shift"; templateId: string } | { kind: "off" })[] | null
  isActive: boolean
}

/** Lokasyon bazlı yoklama kuralları (kiracı varsayılanını daraltır) */
export interface MockLocationRules extends Tenanted {
  lateToleranceMinutes: number | null
  alarmSlaMinutes: number | null
}

export interface MockShiftAssignment extends Tenanted {
  personnelId: string
  locationId: string
  date: string
  templateId: string | null
  code: string
  startsAt: string
  endsAt: string
  breakMinutes: number
  kind: "regular" | "backup"
  /** Yedek atamada yerine geçilen vardiya */
  replacesShiftId: string | null
}

export interface MockAttendanceEvent extends Tenanted {
  shiftId: string
  personnelId: string
  kind: "in" | "out"
  method: "qr" | "nfc" | "manual"
  deviceTime: string
  receivedAt: string
  offline: boolean
  inside: boolean
  distanceMeters: number
  hasPhoto: boolean
  corrected: boolean
}

export interface MockLeave extends Tenanted {
  personnelId: string
  type:
    | "annual"
    | "excuse"
    | "unpaid"
    | "maternity"
    | "administrative"
    | "sick_report"
  startDate: string
  endDate: string
  days: number
  status: "pending" | "approved" | "rejected" | "cancelled"
  note: string | null
  requestedAt: string
  requestedBy: string
  decidedAt: string | null
  decidedBy: string | null
  decisionNote: string | null
}

export interface MockAlarm extends Tenanted {
  shiftId: string
  personnelId: string
  locationId: string
  createdAt: string
  dueAt: string
  status: "open" | "escalated" | "resolved"
  escalatedAt: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  resolution: {
    reason:
      | "late_arrival"
      | "on_leave"
      | "system_error"
      | "shift_cancelled"
      | "other"
      | "backup_assigned"
    note: string | null
    backupPersonnelId: string | null
  } | null
  notes: { at: string; author: string; text: string }[]
}

export interface MockTimesheetPeriod extends Tenanted {
  legalEntityId: string
  month: string
  status:
    "open" | "region_approved" | "customer_approved" | "hr_approved" | "locked"
  customerApprovalRequired: boolean
  history: { at: string; actor: string; action: string }[]
  changes: {
    at: string
    actor: string
    personnelId: string
    date: string
    before: string | null
    after: string
  }[]
}

/** Elle düzeltilen puantaj hücresi. id: `${periodId}|${personnelId}|${date}` */
export interface MockTimesheetOverride extends Tenanted {
  periodId: string
  personnelId: string
  date: string
  code: string
  overtimeHours: number
  by: string
  at: string
}

export interface MockPayrollProfile extends Tenanted {
  name: string
  description: string
  libraryKey: "logo-bordro-plus" | "generic-csv" | null
  simulated: boolean
  format: "xlsx" | "csv" | "txt"
  encoding: "utf-8" | "windows-1254"
  delimiter: ";" | "," | "\t" | "|"
  decimalSeparator: "," | "."
  includeHeader: boolean
  columns: unknown[]
  codeMap: Record<string, string>
  updatedAt: string
}

export interface MockPayrollExport extends Tenanted {
  periodId: string
  profileId: string
  profileName: string
  fileName: string
  format: "xlsx" | "csv" | "txt"
  encoding: "utf-8" | "windows-1254"
  rowCount: number
  createdAt: string
  createdBy: string
  bytes: Uint8Array
  contentType: string
}

/* ───────────────────────── Faz 3: sözleşme ve hakediş ───────────────────────── */

/** Sözleşme sürümü (kapsam, kadro, fiyat, kural). Adlar yanıt üretilirken eklenir. */
export interface MockContractVersion {
  id: string
  number: number
  effectiveFrom: string
  /** Son sürümde sözleşme bitişi */
  effectiveTo: string
  note: string | null
  createdAt: string
  createdBy: string
  serviceLines: ServiceLine[]
  scopeItems: { serviceLine: ServiceLine; description: string }[]
  locations: { locationId: string; from: string; to: string | null }[]
  commitments: {
    locationId: string
    position: Position
    headcount: number
    coverage: "weekdays" | "six_days" | "all_days"
  }[]
  prices: {
    unitPrices: { position: Position; monthly: number }[]
    overtimeHourly: number
    materialMonthly: number
  }
  rules: MockContractRules
}

export interface MockContractRules {
  shortfallDeductionPercent: number
  shortfallPenaltyPerPersonDay: number
  vatRate: number
  priceAdjustment: {
    kind: "none" | "min_wage" | "fixed_rate"
    laborSharePercent: number
    ratePercent: number | null
    effectiveFrom: string | null
  }
  penalties: {
    code: string
    label: string
    kind: "fixed" | "percent"
    amount: number
  }[]
}

export interface MockContract extends Tenanted {
  code: string
  title: string
  type: "public_tender" | "private" | "staffing"
  ikn: string | null
  customerId: string
  contractorLegalEntityId: string
  startDate: string
  endDate: string
  terminatedAt: string | null
  templateId: string | null
  versions: MockContractVersion[]
  updatedAt: string
}

export interface MockContractTemplate extends Tenanted {
  name: string
  description: string
  contractType: "public_tender" | "private" | "staffing"
  builtIn: boolean
  rules: MockContractRules
  updatedAt: string
}

/** Hakediş. `source`: hesaba esas kişi-gün verisi (fark ve yeniden hesap için saklanır). */
export interface MockProgressPayment extends Tenanted {
  number: string
  contractId: string
  month: string
  status: "draft" | "review" | "customer_approval" | "approved" | "invoiced"
  penalties: {
    code: string
    label: string
    kind: "fixed" | "percent"
    amount: number
    quantity: number
    note: string | null
  }[]
  source: {
    locationId: string
    position: Position
    date: string
    personDays: number
    overtimeHours: number
  }[]
  fingerprint: string
  calculatedAt: string
  invoiceNumber: string | null
  history: { at: string; actor: string; action: string; note: string | null }[]
  updatedAt: string
}
