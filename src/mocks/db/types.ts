import type { AccessScope, Permission } from "@/entities/session"
import type { HazardClass, ServiceLine } from "@/entities/tenant"
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
import type { TrainingType } from "@/entities/ohs"
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
  /** `null` = kiracı varsayılanı */
  hazardClass: HazardClass | null
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

/* ───────────────────────────── Faz 4: Kalite ve iş emirleri ───────────────────────────── */

export interface MockIssueCatalogEntry {
  code: string
  label: string
  serviceLine: ServiceLine
  areaTypes: AreaType[]
  priority: "urgent" | "high" | "normal" | "low"
  isActive: boolean
}

/** Kiracının sorun kataloğu (kiracı başına tek kayıt, `id` = kiracı) */
export interface MockIssueCatalog extends Tenanted {
  items: MockIssueCatalogEntry[]
  updatedAt: string
}

export interface MockAuditItem {
  id: string
  text: string
  type: "yes_no" | "score_1_5" | "photo_required" | "note"
  weight: number
  critical: boolean
  workOrderPriority: "urgent" | "high" | "normal" | "low"
}

export interface MockAuditSection {
  id: string
  title: string
  items: MockAuditItem[]
}

export interface MockAuditTemplateVersion {
  number: number
  publishedAt: string
  publishedBy: string
  sections: MockAuditSection[]
}

export interface MockAuditTemplate extends Tenanted {
  name: string
  description: string | null
  serviceLine: ServiceLine
  sectors: CustomerSector[]
  builtIn: boolean
  isActive: boolean
  /** Son sürüm en sonda; geçmiş denetimler kendi sürüm numarasına bağlıdır */
  versions: MockAuditTemplateVersion[]
  updatedAt: string
}

export interface MockAuditPlan extends Tenanted {
  auditorId: string
  locationId: string
  templateId: string
  frequency: "weekly" | "biweekly" | "monthly"
  startDate: string
  isActive: boolean
}

export interface MockAuditAnswer {
  itemId: string
  passed: boolean | null
  score: number | null
  note: string | null
  photoCount: number
}

export interface MockAudit extends Tenanted {
  number: string
  templateId: string
  templateVersion: number
  locationId: string
  auditorId: string | null
  auditorName: string
  performedAt: string
  answers: MockAuditAnswer[]
  generalNote: string | null
  score: number
  passed: boolean
  criticalFailures: string[]
}

export interface MockWorkOrderReport {
  id: string
  receivedAt: string
  channel: "qr" | "portal" | "audit" | "panel"
  issueLabel: string
  note: string | null
  photoId: string | null
}

export interface MockWorkOrder extends Tenanted {
  number: string
  title: string
  description: string | null
  source: "qr_feedback" | "audit_critical" | "manual" | "customer_request"
  status:
    "new" | "assigned" | "in_progress" | "completed" | "verified" | "cancelled"
  priority: "urgent" | "high" | "normal" | "low"
  categoryCode: string | null
  serviceLine: ServiceLine
  locationId: string
  areaId: string | null
  assigneeId: string | null
  createdAt: string
  dueAt: string
  completedAt: string | null
  verifiedAt: string | null
  /** Birleştirme penceresi için son bildirim zamanı */
  lastReportAt: string
  reports: MockWorkOrderReport[]
  history: {
    at: string
    actorName: string
    action: string
    note: string | null
  }[]
  completionNote: string | null
  completionPhotoId: string | null
  cancelReason: string | null
  auditId: string | null
  auditItemId: string | null
  /** Müşteri talebini açan portal kullanıcısı */
  requestedBy: string | null
}

/** Public QR gönderimleri: idempotency (istek kimliği) ve cihaz bekleme süresi */
export interface MockFeedbackSubmission extends Tenanted {
  token: string
  deviceId: string
  receivedAt: string
  workOrderId: string
  merged: boolean
}

export interface MockReportSubscription extends Tenanted {
  customerId: string
  recipients: string[]
  frequency: "off" | "weekly" | "monthly"
  includeSections: ("sla" | "audits" | "work_orders" | "headcount")[]
  updatedAt: string
  updatedBy: string
}

/** Yüklenen dosyalar (iş emri fotoğrafları, özlük ve sertifika belgeleri) */
export interface MockUpload extends Tenanted {
  name: string
  contentType: string
  size: number
  createdAt: string
  /** Faz 6: amaç (yetki ve dosya kuralları amaca göre) */
  purpose?: "work_order_photo" | "personnel_doc" | "certificate_doc"
}

// Faz 6: İSG ve özlük ----------------------------------------------------------

export interface MockDocumentType {
  id: string
  name: string
  required: boolean
  /** Belge bu kadar ay geçerli (adli sicil 6 ay); `null` = süresiz */
  validityMonths: number | null
  isActive: boolean
}

/** Kiracının İSG kataloğu (kayıt kimliği = kiracı) */
export interface MockOhsSettings extends Tenanted {
  trainingTypes: TrainingType[]
  documentTypes: MockDocumentType[]
  /** Sertifika tipi başına varsayılan geçerlilik (ay); yeni kayıtta bitiş önerisi */
  certificateValidityMonths: Partial<Record<CertificateType, number | null>>
}

export interface MockTrainingSession extends Tenanted {
  number: string
  typeId: string
  date: string
  trainer: string
  locationId: string | null
  durationHours: number
  participants: { personnelId: string; attended: boolean | null }[]
  status: "planned" | "completed" | "cancelled"
  createdAt: string
}

export interface MockTrainingRecord extends Tenanted {
  personnelId: string
  typeId: string
  completedAt: string
  sessionId: string | null
}

export interface MockCertificate extends Tenanted {
  personnelId: string
  type: CertificateType
  number: string
  issuedAt: string
  expiresAt: string | null
  uploadId: string | null
  createdAt: string
}

export type HealthResult = "fit" | "conditional" | "unfit"

/** Sağlık gözetimi (özel nitelikli veri). Tanı tutulmaz. */
export interface MockHealthRecord extends Tenanted {
  personnelId: string
  examinedAt: string
  nextExamAt: string
  result: HealthResult
  vaccinations: { type: string; date: string; nextDoseAt: string | null }[]
  updatedAt: string
  updatedBy: string
}

export interface MockHealthAccessLog extends Tenanted {
  occurredAt: string
  actorName: string
  personnelId: string
  action: "reveal" | "update"
  reason: string
}

export interface MockPersonnelDocumentVersion {
  uploadId: string
  name: string
  issuedAt: string | null
  uploadedAt: string
  uploadedBy: string
}

export interface MockPersonnelDocument extends Tenanted {
  personnelId: string
  typeId: string
  /** En yenisi sonda */
  versions: MockPersonnelDocumentVersion[]
}
