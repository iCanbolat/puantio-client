import type { TenantConfig } from "@/entities/tenant"

/**
 * Mock kiracılar. Sektör profillerine göre kurgulanmıştır; gerçek firma adı kullanılmaz.
 * - temizlik-orta: tek tüzel kişilik, temizlik, yerel hesap girişi (orta ölçek)
 * - cok-hatli-grup: 3 tüzel kişilik, temizlik + teknik + peyzaj, Google federasyonu
 * - guvenlik: özel güvenlik, devriye ve nokta terminolojisi
 * - entegre-buyuk: entegre tesis yönetimi, Entra federasyonu, ölçek verisi
 * - platform: Puantio işletmecisinin yönetim paneli
 */
export interface MockTenant extends TenantConfig {
  id: string
  createdAt: string
  adminEmail: string
}

const ISSUER = "https://auth.puantio.com/realms/puantio"

const baseRules = {
  idleTimeoutMinutes: 30,
  lateToleranceMinutes: 10,
  alarmSlaMinutes: 15,
  geofence: { min: 25, max: 1000, default: 100 },
}

const passwordProvider = {
  id: "password",
  kind: "password" as const,
  label: "E-posta ile giriş yap",
  idpHint: null,
  domains: [],
}

export const MOCK_TENANT_SLUGS = [
  "temizlik-orta",
  "cok-hatli-grup",
  "guvenlik",
  "entegre-buyuk",
] as const
export type MockTenantSlug = (typeof MOCK_TENANT_SLUGS)[number]

export function buildMockTenants(): MockTenant[] {
  const createdAt = "2026-01-15T09:00:00+03:00"
  return [
    {
      id: "temizlik-orta",
      slug: "temizlik-orta",
      kind: "tenant",
      status: "active",
      displayName: "Lavanta Tesis Hizmetleri",
      shortName: "Lavanta",
      branding: { logoUrl: null, primaryColor: "#5b21b6", faviconUrl: null },
      auth: {
        issuer: ISSUER,
        clientId: "puantio-web",
        organization: "temizlik-orta",
        providers: [passwordProvider],
      },
      modules: [
        "core",
        "attendance",
        "timesheet",
        "contracts",
        "quality",
        "customer_portal",
        "inventory",
        "ohs",
      ],
      terminology: {
        orgLevels: [{ singular: "Bölge", plural: "Bölgeler" }],
        location: { singular: "Lokasyon", plural: "Lokasyonlar" },
        area: { singular: "Alan", plural: "Alanlar" },
      },
      serviceLines: ["cleaning", "pest_control"],
      rules: baseRules,
      createdAt,
      adminEmail: "yonetici@lavanta.example",
    },
    {
      id: "cok-hatli-grup",
      slug: "cok-hatli-grup",
      kind: "tenant",
      status: "active",
      displayName: "Çınar Şirketler Grubu",
      shortName: "Çınar Grup",
      branding: { logoUrl: null, primaryColor: "#0f766e", faviconUrl: null },
      auth: {
        issuer: ISSUER,
        clientId: "puantio-web",
        organization: "cok-hatli-grup",
        providers: [
          {
            id: "google",
            kind: "google",
            label: "Google ile giriş yap",
            idpHint: "cinar-google",
            domains: ["cinargrup.example"],
          },
          passwordProvider,
        ],
      },
      modules: [
        "core",
        "attendance",
        "timesheet",
        "contracts",
        "quality",
        "customer_portal",
        "inventory",
        "maintenance",
      ],
      terminology: {
        orgLevels: [
          { singular: "Bölge", plural: "Bölgeler" },
          { singular: "Alt bölge", plural: "Alt bölgeler" },
        ],
        location: { singular: "Proje", plural: "Projeler" },
        area: { singular: "Alan", plural: "Alanlar" },
      },
      serviceLines: [
        "cleaning",
        "technical",
        "landscaping",
        "laundry",
        "reception",
        "staffing",
      ],
      rules: { ...baseRules, idleTimeoutMinutes: 20 },
      createdAt,
      adminEmail: "bt@cinargrup.example",
    },
    {
      id: "guvenlik",
      slug: "guvenlik",
      kind: "tenant",
      status: "active",
      displayName: "Kalkan Güvenlik Hizmetleri",
      shortName: "Kalkan",
      branding: { logoUrl: null, primaryColor: "#1e3a8a", faviconUrl: null },
      auth: {
        issuer: ISSUER,
        clientId: "puantio-web",
        organization: "guvenlik",
        providers: [passwordProvider],
      },
      modules: [
        "core",
        "attendance",
        "timesheet",
        "contracts",
        "ohs",
        "security_patrol",
      ],
      terminology: {
        orgLevels: [{ singular: "Bölge", plural: "Bölgeler" }],
        location: { singular: "Görev yeri", plural: "Görev yerleri" },
        area: { singular: "Nokta", plural: "Noktalar" },
      },
      serviceLines: ["security"],
      rules: {
        ...baseRules,
        lateToleranceMinutes: 0,
        alarmSlaMinutes: 5,
        geofence: { min: 15, max: 500, default: 50 },
      },
      createdAt,
      adminEmail: "yonetim@kalkan.example",
    },
    {
      id: "entegre-buyuk",
      slug: "entegre-buyuk",
      kind: "tenant",
      status: "active",
      displayName: "Atlas Entegre Tesis Yönetimi",
      shortName: "Atlas",
      branding: { logoUrl: null, primaryColor: "#b45309", faviconUrl: null },
      auth: {
        issuer: ISSUER,
        clientId: "puantio-web",
        organization: "entegre-buyuk",
        providers: [
          {
            id: "entra",
            kind: "microsoft",
            label: "Microsoft ile giriş yap",
            idpHint: "atlas-entra",
            domains: ["atlasfm.example"],
          },
          passwordProvider,
        ],
      },
      modules: [
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
      ],
      terminology: {
        orgLevels: [
          { singular: "Bölge", plural: "Bölgeler" },
          { singular: "Alt bölge", plural: "Alt bölgeler" },
        ],
        location: { singular: "Tesis", plural: "Tesisler" },
        area: { singular: "Alan", plural: "Alanlar" },
      },
      serviceLines: [
        "cleaning",
        "security",
        "technical",
        "landscaping",
        "pest_control",
        "catering",
        "reception",
      ],
      rules: { ...baseRules, idleTimeoutMinutes: 15 },
      createdAt,
      adminEmail: "it@atlasfm.example",
    },
    {
      id: "platform",
      slug: "platform",
      kind: "platform",
      status: "active",
      displayName: "Puantio Yönetim",
      shortName: "Yönetim",
      branding: { logoUrl: null, primaryColor: null, faviconUrl: null },
      auth: {
        issuer: ISSUER,
        clientId: "puantio-platform",
        organization: "platform",
        providers: [
          {
            id: "staff",
            kind: "microsoft",
            label: "Puantio hesabıyla giriş yap",
            idpHint: "puantio-staff",
            domains: ["puantio.com"],
          },
        ],
      },
      modules: ["core"],
      terminology: {
        orgLevels: [{ singular: "Bölge", plural: "Bölgeler" }],
        location: { singular: "Lokasyon", plural: "Lokasyonlar" },
        area: { singular: "Alan", plural: "Alanlar" },
      },
      serviceLines: [],
      rules: baseRules,
      createdAt,
      adminEmail: "destek@puantio.com",
    },
  ]
}

/** Yanıtta yalnızca sözleşmedeki alanlar döner */
export function toTenantConfig(tenant: MockTenant): TenantConfig {
  const {
    id: _id,
    createdAt: _createdAt,
    adminEmail: _adminEmail,
    ...config
  } = tenant
  return config
}
