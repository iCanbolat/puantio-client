import { buildShowcaseRecords } from "@/features/dev-showcase/mocks/factories"
import type { ShowcaseRecord } from "@/features/dev-showcase/model/showcase-record"

import {
  DEFAULT_SEED,
  SEED_REFERENCE_DATE,
  resetFaker,
} from "../factories/faker"
import {
  buildTenantMasterData,
  type MasterDataSizes,
} from "../master-data/factories"
import { buildSystemRoles, type MockRole } from "../tenancy/roles"
import { buildMockTenants, type MockTenant } from "../tenancy/tenants"
import { buildTenantUsers } from "../tenancy/users"
import { Collection } from "./collection"
import type {
  MockArea,
  MockAuditEvent,
  MockCustomer,
  MockLegalEntity,
  MockLocation,
  MockOrgUnit,
  MockPersonnel,
  MockSupportSession,
  MockTag,
  MockUser,
} from "./types"

export { Collection } from "./collection"
export type * from "./types"

/** Mock veritabanı. Kiracıya ait her kayıt `tenantId` taşır. */
export const db = {
  showcaseRecords: new Collection<ShowcaseRecord>("showcaseRecords"),
  tenants: new Collection<MockTenant>("tenants"),
  roles: new Collection<MockRole>("roles"),
  users: new Collection<MockUser>("users"),
  supportSessions: new Collection<MockSupportSession>("supportSessions"),
  auditEvents: new Collection<MockAuditEvent>("auditEvents"),
  legalEntities: new Collection<MockLegalEntity>("legalEntities"),
  orgUnits: new Collection<MockOrgUnit>("orgUnits"),
  customers: new Collection<MockCustomer>("customers"),
  locations: new Collection<MockLocation>("locations"),
  areas: new Collection<MockArea>("areas"),
  tags: new Collection<MockTag>("tags"),
  personnel: new Collection<MockPersonnel>("personnel"),
}

/** Kiracıya ait iş verisi koleksiyonları ("Boş veri" senaryosu bunları temizler) */
export const TENANT_DATA_COLLECTIONS = [
  "auditEvents",
  "legalEntities",
  "orgUnits",
  "customers",
  "locations",
  "areas",
  "tags",
  "personnel",
] as const satisfies readonly (keyof typeof db)[]

export type SeedProfile = "test" | "dev" | "scale"

interface ProfileDefinition {
  label: string
  showcaseRecords: number
  tenant: MasterDataSizes
  /** Ölçek verisi yalnızca bu kiracıya uygulanır (diğerleri `tenant` boyutunda) */
  scaleTenant?: { slug: string; sizes: MasterDataSizes }
}

export const SEED_PROFILES: Record<SeedProfile, ProfileDefinition> = {
  test: {
    label: "Test (küçük, hızlı)",
    showcaseRecords: 45,
    tenant: { personnel: 40, locations: 24, customers: 8, maxAreas: 3 },
  },
  dev: {
    label: "Geliştirme (orta)",
    showcaseRecords: 240,
    tenant: { personnel: 400, locations: 150, customers: 30, maxAreas: 4 },
  },
  scale: {
    label: "Ölçek (Atlas: 6.000 personel, 15.000 tesis)",
    showcaseRecords: 15_000,
    tenant: { personnel: 400, locations: 150, customers: 30, maxAreas: 4 },
    scaleTenant: {
      slug: "entegre-buyuk",
      sizes: {
        personnel: 6000,
        locations: 15_000,
        customers: 400,
        maxAreas: 1,
      },
    },
  },
}

export function clearDatabase(): void {
  for (const collection of Object.values(db)) collection.clear()
}

export function clearTenantData(): void {
  for (const name of TENANT_DATA_COLLECTIONS) db[name].clear()
}

export function seedDatabase(
  profile: SeedProfile,
  seed: number = DEFAULT_SEED
): void {
  resetFaker(seed)
  const definition = SEED_PROFILES[profile]
  db.showcaseRecords.insertMany(
    buildShowcaseRecords(definition.showcaseRecords)
  )

  for (const tenant of buildMockTenants()) {
    db.tenants.insert(tenant)
    if (tenant.kind === "platform") continue
    db.roles.insertMany(buildSystemRoles(tenant.slug))
    const sizes =
      definition.scaleTenant?.slug === tenant.slug
        ? definition.scaleTenant.sizes
        : definition.tenant
    const data = buildTenantMasterData(tenant, sizes)
    db.legalEntities.insertMany(data.legalEntities)
    db.orgUnits.insertMany(data.orgUnits)
    db.customers.insertMany(data.customers)
    db.locations.insertMany(data.locations)
    db.areas.insertMany(data.areas)
    db.tags.insertMany(data.tags)
    db.personnel.insertMany(data.personnel)
    db.users.insertMany(buildTenantUsers(tenant, data, SEED_REFERENCE_DATE))
    db.auditEvents.insert({
      id: `aud-${tenant.slug}-1`,
      tenantId: tenant.slug,
      occurredAt: SEED_REFERENCE_DATE.toISOString(),
      actorName: "Sistem",
      actorKind: "system",
      action: "Kiracı oluşturuldu",
      targetType: "tenant",
      targetLabel: tenant.displayName,
      details: null,
    })
  }
}

export function resetDatabase(
  profile: SeedProfile,
  seed: number = DEFAULT_SEED
): void {
  clearDatabase()
  seedDatabase(profile, seed)
}

/** Deterministiklik testleri için veritabanının anlık görüntüsü. */
export function snapshotDatabase() {
  return Object.fromEntries(
    Object.entries(db).map(([name, collection]) => [
      name,
      collection.findMany(),
    ])
  )
}

let idCounter = 0
/** Çalışma anında oluşturulan kayıtlar için kimlik */
export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
