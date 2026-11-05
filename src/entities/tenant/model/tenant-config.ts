import { z } from "zod"

import { isHexColor } from "@/shared/lib/color"

/**
 * Kiracı yapılandırması: `GET /public/tenant-config` (oturumsuz). Kiracıya özel her şey
 * (ad, marka, giriş sağlayıcıları, modüller, terminoloji, kurallar) build'e değil buraya
 * bağlıdır; tek build tüm firmalara hizmet eder.
 */

/** Satılabilir modüller. `core` (ana veri, kullanıcılar, ayarlar) her pakette vardır. */
export const MODULE_IDS = [
  "core",
  "attendance",
  "timesheet",
  "contracts",
  "quality",
  "customer_portal",
  "inventory",
  "ohs",
  "maintenance",
  "security_patrol",
] as const
export const moduleIdSchema = z.enum(MODULE_IDS)
export type ModuleId = z.infer<typeof moduleIdSchema>

export const MODULES: Record<
  ModuleId,
  { label: string; description: string; phase: string }
> = {
  core: {
    label: "Çekirdek",
    description: "Ana veri, kullanıcılar, roller, Excel içe aktarma",
    phase: "1",
  },
  attendance: {
    label: "Vardiya ve yoklama",
    description: "Vardiya planlama, canlı yoklama, gelmeyen personel alarmı",
    phase: "2",
  },
  timesheet: {
    label: "Puantaj ve bordro",
    description: "Aylık puantaj, onay akışı, bordro aktarımı",
    phase: "2",
  },
  contracts: {
    label: "Sözleşme ve hakediş",
    description: "Sözleşme, kadro taahhüdü, hakediş",
    phase: "3",
  },
  quality: {
    label: "Kalite ve iş emirleri",
    description: "Denetim, QR bildirim, iş emirleri",
    phase: "4",
  },
  customer_portal: {
    label: "Müşteri portalı",
    description: "Müşteri raporları ve onaylar",
    phase: "4",
  },
  inventory: {
    label: "Stok ve zimmet",
    description: "Depo, sevkiyat, zimmet, kârlılık",
    phase: "5",
  },
  ohs: {
    label: "İSG ve özlük",
    description: "Eğitim, sağlık gözetimi, sertifikalar, özlük",
    phase: "6",
  },
  maintenance: {
    label: "Teknik bakım",
    description: "Ekipman, periyodik bakım, arıza",
    phase: "5b",
  },
  security_patrol: {
    label: "Güvenlik",
    description: "Devriye, nokta kapsaması, olay raporu",
    phase: "6b",
  },
}

export const SERVICE_LINES = [
  "cleaning",
  "security",
  "technical",
  "landscaping",
  "pest_control",
  "catering",
  "reception",
  "laundry",
  "staffing",
] as const
export const serviceLineSchema = z.enum(SERVICE_LINES)
export type ServiceLine = z.infer<typeof serviceLineSchema>

export const SERVICE_LINE_LABELS: Record<ServiceLine, string> = {
  cleaning: "Temizlik",
  security: "Güvenlik",
  technical: "Teknik bakım",
  landscaping: "Peyzaj",
  pest_control: "Haşere kontrolü",
  catering: "Yemek",
  reception: "Resepsiyon",
  laundry: "Çamaşırhane",
  staffing: "Personel temini",
}

/** Bilinmeyen (yeni) değerler yok sayılır: backend yeni modül eklediğinde eski istemci bozulmaz. */
function knownValues<const T extends readonly [string, ...string[]]>(
  values: T
) {
  return z
    .array(z.string())
    .transform((items) =>
      items.filter((item): item is T[number] =>
        (values as readonly string[]).includes(item)
      )
    )
}

export const termSchema = z.object({
  singular: z.string().trim().min(1).max(40),
  plural: z.string().trim().min(1).max(40),
})
export type Term = z.infer<typeof termSchema>

/**
 * Hiyerarşi ve kavram adları. Lokasyonun üstünde 1–2 organizasyon seviyesi vardır
 * (ör. Bölge → Alt bölge); altında alanlar. Toplam 3–4 seviye.
 */
export const terminologySchema = z.object({
  orgLevels: z.array(termSchema).min(1).max(2),
  location: termSchema,
  area: termSchema,
})
export type Terminology = z.infer<typeof terminologySchema>

export const AUTH_PROVIDER_KINDS = [
  "microsoft",
  "google",
  "oidc",
  "saml",
  "password",
] as const
export const authProviderSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(AUTH_PROVIDER_KINDS),
  label: z.string().min(1),
  /** Keycloak `kc_idp_hint`: kullanıcı doğrudan bu kimlik sağlayıcısına yönlenir */
  idpHint: z.string().min(1).nullable(),
  /** Bu sağlayıcıya yönlenecek e-posta alan adları (sağlayıcı keşfi) */
  domains: z.array(z.string()),
})
export type AuthProvider = z.infer<typeof authProviderSchema>

export const tenantAuthSchema = z.object({
  /** Keycloak realm adresi (OIDC issuer) */
  issuer: z.url(),
  clientId: z.string().min(1),
  /** Keycloak organization takma adı; token'daki `organization` ile eşleşmeli */
  organization: z.string().min(1),
  providers: z.array(authProviderSchema).min(1),
})
export type TenantAuth = z.infer<typeof tenantAuthSchema>

export const DEFAULT_LABOR_RULES = {
  weeklyHours: 45,
  dailyHours: 11,
  minRestHours: 11,
  weeklyRestHours: 24,
  annualOvertimeHours: 270,
}

export const laborRulesSchema = z.object({
  weeklyHours: z.number().int().min(1).max(84),
  dailyHours: z.number().int().min(1).max(24),
  minRestHours: z.number().int().min(0).max(24),
  weeklyRestHours: z.number().int().min(0).max(72),
  annualOvertimeHours: z.number().int().min(0).max(1000),
})
export type LaborRules = z.infer<typeof laborRulesSchema>

export const tenantRulesSchema = z
  .object({
    idleTimeoutMinutes: z.number().int().min(5).max(240),
    lateToleranceMinutes: z.number().int().min(0).max(60),
    alarmSlaMinutes: z.number().int().min(5).max(120),
    /** Çözülmeyen alarm bu süre sonunda operasyon müdürüne eskale edilir (alarm oluşumundan itibaren) */
    escalationMinutes: z.number().int().min(5).max(240).default(15),
    /** 4857 sayılı İş Kanunu varsayılanları; kural motoru uyarı üretir, kesin karar backend'de */
    labor: laborRulesSchema.default(DEFAULT_LABOR_RULES),
    geofence: z.object({
      min: z.number().int().min(10),
      max: z.number().int().max(5000),
      default: z.number().int(),
    }),
  })
  .refine(
    (rules) =>
      rules.geofence.min <= rules.geofence.default &&
      rules.geofence.default <= rules.geofence.max,
    {
      message: "Geofence varsayılanı sınırlar içinde olmalı",
      path: ["geofence"],
    }
  )
export type TenantRules = z.infer<typeof tenantRulesSchema>

export const tenantBrandingSchema = z.object({
  logoUrl: z.string().min(1).nullable(),
  primaryColor: z
    .string()
    .refine(isHexColor, "Renk #RRGGBB biçiminde olmalı")
    .nullable(),
  faviconUrl: z.string().min(1).nullable(),
})
export type TenantBranding = z.infer<typeof tenantBrandingSchema>

export const tenantSlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/)

export const tenantConfigSchema = z.object({
  slug: tenantSlugSchema,
  /** `platform`: Puantio işletmecisinin yönetim paneli (`platform.puantio.com`) */
  kind: z.enum(["tenant", "platform"]),
  status: z.enum(["active", "suspended"]),
  displayName: z.string().min(1),
  shortName: z.string().min(1).max(24),
  branding: tenantBrandingSchema,
  auth: tenantAuthSchema,
  modules: knownValues(MODULE_IDS),
  terminology: terminologySchema,
  serviceLines: knownValues(SERVICE_LINES),
  rules: tenantRulesSchema,
})
export type TenantConfig = z.infer<typeof tenantConfigSchema>
