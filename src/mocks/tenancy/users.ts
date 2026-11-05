import { faker } from "../factories/faker"
import type {
  MockLocation,
  MockOrgUnit,
  MockCustomer,
  MockUser,
} from "../db/types"
import { SYSTEM_ROLE_TEMPLATES } from "./roles"
import type { MockTenant } from "./tenants"

/** Her kiracıda bulunan, testlerin ve dev panelinin kullandığı sabit kullanıcılar */
export const MOCK_USER_KEYS = [
  "admin",
  "operasyon",
  "bolge",
  "supervizor",
  "ik",
  "finans",
  "depo",
  "isg",
  "musteri",
] as const
export type MockUserKey = (typeof MOCK_USER_KEYS)[number]

const FIXED: Record<
  MockUserKey | "davetli" | "pasif",
  { name: string; title: string; roles: string[] }
> = {
  admin: {
    name: "Ayşe Yılmaz",
    title: "Genel Müdür Yardımcısı",
    roles: ["super_admin", "tenant_admin"],
  },
  operasyon: {
    name: "Murat Demir",
    title: "Operasyon Müdürü",
    roles: ["operations_manager"],
  },
  bolge: {
    name: "Elif Kaya",
    title: "Bölge Sorumlusu",
    roles: ["regional_manager"],
  },
  supervizor: {
    name: "Hakan Çelik",
    title: "Saha Süpervizörü",
    roles: ["supervisor"],
  },
  ik: {
    name: "Zeynep Arslan",
    title: "İK ve Bordro Uzmanı",
    roles: ["hr_payroll"],
  },
  finans: { name: "Burak Şahin", title: "Finans Müdürü", roles: ["finance"] },
  depo: { name: "Emre Koç", title: "Depo Sorumlusu", roles: ["warehouse"] },
  isg: { name: "Selin Aydın", title: "İSG Uzmanı", roles: ["ohs_specialist"] },
  musteri: {
    name: "Kerem Öztürk",
    title: "Müşteri İdari İşler",
    roles: ["customer_admin"],
  },
  davetli: {
    name: "Gizem Polat",
    title: "Bölge Sorumlusu",
    roles: ["regional_manager"],
  },
  pasif: {
    name: "Oğuz Yıldız",
    title: "Eski Süpervizör",
    roles: ["supervisor"],
  },
}

export const mockUserId = (tenantSlug: string, key: string) =>
  `u-${tenantSlug}-${key}`

export const MOCK_EMAIL_DOMAINS: Record<string, string> = {
  "temizlik-orta": "lavanta.example",
  "cok-hatli-grup": "cinargrup.example",
  guvenlik: "kalkan.example",
  "entegre-buyuk": "atlasfm.example",
}

const EMAIL_KEYS: Record<string, string> = {
  admin: "ayse.yilmaz",
  operasyon: "murat.demir",
  bolge: "elif.kaya",
  supervizor: "hakan.celik",
  ik: "zeynep.arslan",
  finans: "burak.sahin",
  depo: "emre.koc",
  isg: "selin.aydin",
  musteri: "kerem.ozturk",
  davetli: "gizem.polat",
  pasif: "oguz.yildiz",
}

export function buildTenantUsers(
  tenant: MockTenant,
  data: {
    orgUnits: MockOrgUnit[]
    locations: MockLocation[]
    customers: MockCustomer[]
  },
  referenceDate: Date
): MockUser[] {
  const domain = MOCK_EMAIL_DOMAINS[tenant.slug] ?? `${tenant.slug}.example`
  const root = data.orgUnits.find((unit) => unit.level === 0)
  const inRoot = new Set(
    data.orgUnits
      .filter((unit) => unit.id === root?.id || unit.parentId === root?.id)
      .map((unit) => unit.id)
  )
  const supervised = data.locations
    .filter((location) => inRoot.has(location.orgUnitId))
    .slice(0, 3)
    .map((location) => location.id)
  const roleId = (key: string) => `rol-${tenant.slug}-${key}`
  const lastLogin = referenceDate.toISOString()

  const users: MockUser[] = (Object.keys(FIXED) as (keyof typeof FIXED)[]).map(
    (key) => {
      const fixed = FIXED[key]
      const scope =
        key === "bolge" || key === "davetli"
          ? { kind: "org_units" as const, ids: root ? [root.id] : [] }
          : key === "supervizor" || key === "pasif"
            ? { kind: "locations" as const, ids: supervised }
            : key === "musteri"
              ? {
                  kind: "customers" as const,
                  ids: data.customers[0] ? [data.customers[0].id] : [],
                }
              : { kind: "all" as const }
      return {
        id: mockUserId(tenant.slug, key),
        tenantId: tenant.slug,
        displayName: fixed.name,
        email: `${EMAIL_KEYS[key] ?? key}@${domain}`,
        title: fixed.title,
        roleIds: fixed.roles.map(roleId),
        scope,
        status:
          key === "davetli"
            ? "invited"
            : key === "pasif"
              ? "disabled"
              : "active",
        lastLoginAt: key === "davetli" ? null : lastLogin,
        invitedAt: key === "davetli" ? lastLogin : null,
      }
    }
  )

  const extraRoles = Object.keys(SYSTEM_ROLE_TEMPLATES).filter(
    (key) => !["super_admin", "tenant_admin", "customer_admin"].includes(key)
  )
  for (let index = 0; index < 6; index += 1) {
    const first = faker.person.firstName()
    const last = faker.person.lastName()
    users.push({
      id: mockUserId(tenant.slug, `ek-${index + 1}`),
      tenantId: tenant.slug,
      displayName: `${first} ${last}`,
      email: `kullanici${index + 1}@${domain}`,
      title: null,
      roleIds: [roleId(faker.helpers.arrayElement(extraRoles))],
      scope: { kind: "all" },
      status: "active",
      lastLoginAt: faker.date.recent({ days: 30 }).toISOString(),
      invitedAt: null,
    })
  }
  return users
}

export const PLATFORM_AGENT = {
  id: "u-platform-destek",
  displayName: "Deniz Ak (Puantio Destek)",
  email: "deniz.ak@puantio.com",
  title: "Müşteri Başarı Uzmanı",
}
