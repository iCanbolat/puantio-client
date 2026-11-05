import {
  SENSITIVE_PERMISSIONS,
  TENANT_PERMISSIONS,
  type Permission,
} from "@/entities/session"

export interface MockRole {
  id: string
  tenantId: string
  name: string
  description: string | null
  kind: "system" | "custom"
  templateKey: string | null
  permissions: Permission[]
}

const nonSensitive = TENANT_PERMISSIONS.filter(
  (permission) => !SENSITIVE_PERMISSIONS.includes(permission)
)

/** Sistem rol şablonları (plan §2.5). Kiracı bunları kopyalayarak özel rol oluşturur. */
export const SYSTEM_ROLE_TEMPLATES: Record<
  string,
  { name: string; description: string; permissions: Permission[] }
> = {
  super_admin: {
    name: "Süper yönetici",
    description: "Sağlık verisi hariç tüm yetkiler",
    permissions: nonSensitive,
  },
  tenant_admin: {
    name: "Firma yöneticisi",
    description: "Firma ayarları, kullanıcı ve rol yönetimi",
    permissions: [
      "org:read",
      "org:write",
      "user:read",
      "user:write",
      "role:write",
      "tenant:settings",
      "audit:read",
      "personnel:read",
      "location:read",
      "customer:read",
      "import:run",
    ],
  },
  operations_manager: {
    name: "Operasyon müdürü",
    description: "Tüm bölgelerde operasyon, alarm eskalasyonu, raporlar",
    permissions: [
      "personnel:read",
      "location:read",
      "customer:read",
      "org:read",
      "schedule:read",
      "schedule:write",
      "attendance:read",
      "attendance:correct",
      "alarm:respond",
      "alarm:escalate",
      "leave:read",
      "leave:approve",
      "timesheet:read",
      "contract:read",
      "quality:read",
      "work_order:read",
      "work_order:write",
      "inventory:read",
    ],
  },
  regional_manager: {
    name: "Bölge sorumlusu",
    description:
      "Atanmış bölgelerde vardiya, izin onayı, alarm, puantaj bölge onayı",
    permissions: [
      "personnel:read",
      "personnel:write",
      "location:read",
      "location:write",
      "location:tags",
      "customer:read",
      "org:read",
      "schedule:read",
      "schedule:write",
      "attendance:read",
      "attendance:correct",
      "alarm:respond",
      "leave:read",
      "leave:request",
      "leave:approve",
      "timesheet:read",
      "timesheet:approve_region",
      "quality:read",
      "work_order:read",
      "work_order:write",
    ],
  },
  supervisor: {
    name: "Süpervizör",
    description: "Atanmış lokasyonlarda yoklama düzeltme, denetim, iş emri",
    permissions: [
      "personnel:read",
      "location:read",
      "location:tags",
      "schedule:read",
      "attendance:read",
      "attendance:correct",
      "alarm:respond",
      "leave:read",
      "leave:request",
      "quality:read",
      "quality:write",
      "work_order:read",
      "work_order:write",
    ],
  },
  hr_payroll: {
    name: "İK ve bordro",
    description: "Personel, puantaj İK onayı, bordro aktarımı, özlük",
    permissions: [
      "personnel:read",
      "personnel:write",
      "import:run",
      "org:read",
      "location:read",
      "timesheet:read",
      "timesheet:approve_hr",
      "payroll:export",
      "payroll:profiles",
      "leave:read",
      "leave:request",
      "leave:approve",
      "schedule:read",
      "attendance:read",
      "personnel_file:read",
    ],
  },
  finance: {
    name: "Finans",
    description: "Sözleşme ve hakediş",
    permissions: [
      "customer:read",
      "customer:write",
      "location:read",
      "org:read",
      "contract:read",
      "contract:write",
      "progress_payment:read",
      "progress_payment:approve",
    ],
  },
  warehouse: {
    name: "Depo",
    description: "Stok, sevkiyat, zimmet",
    permissions: [
      "inventory:read",
      "inventory:write",
      "location:read",
      "personnel:read",
    ],
  },
  ohs_specialist: {
    name: "İSG uzmanı",
    description: "İSG eğitimleri ve sağlık verisi (özel nitelikli)",
    permissions: [
      "ohs:read",
      "ohs:write",
      "health:read",
      "health:write",
      "personnel:read",
      "personnel_file:read",
      "location:read",
    ],
  },
  customer_admin: {
    name: "Müşteri yöneticisi",
    description: "Müşteri portalı: kendi sözleşme kapsamı",
    permissions: [
      "location:read",
      "quality:read",
      "work_order:read",
      "contract:read",
      "progress_payment:read",
      "timesheet:approve_customer",
    ],
  },
}

export function buildSystemRoles(tenantId: string): MockRole[] {
  return Object.entries(SYSTEM_ROLE_TEMPLATES).map(([key, template]) => ({
    id: `rol-${tenantId}-${key}`,
    tenantId,
    name: template.name,
    description: template.description,
    kind: "system",
    templateKey: key,
    permissions: [...template.permissions],
  }))
}

export const PLATFORM_ROLE: Omit<MockRole, "tenantId"> = {
  id: "rol-platform-destek",
  name: "Platform destek",
  description: "Kiracı yönetimi ve destek oturumu",
  kind: "system",
  templateKey: "platform_support",
  permissions: ["platform:tenants", "platform:support"],
}

/** Destek oturumunda platform personeline verilen salt okunur yetkiler (sağlık hariç) */
export const SUPPORT_PERMISSIONS: Permission[] = TENANT_PERMISSIONS.filter(
  (permission) =>
    (permission.endsWith(":read") &&
      !SENSITIVE_PERMISSIONS.includes(permission)) ||
    permission === "audit:read"
)
