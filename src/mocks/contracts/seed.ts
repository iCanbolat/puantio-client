import type { Position } from "@/entities/personnel"

import { SEED_REFERENCE_DATE } from "../factories/faker"
import type { TenantMasterData } from "../master-data/factories"
import type {
  MockContract,
  MockContractRules,
  MockContractTemplate,
  MockContractVersion,
} from "../db/types"
import { rand, randInt } from "../operations/hash"
import type { MockTenant } from "../tenancy/tenants"

/** Mock birim fiyatlar (kişi/ay, kuruş). Gerçek fiyatlar sözleşmeden gelir. */
export const MOCK_UNIT_PRICES: Record<Position, number> = {
  cleaning_staff: 4_200_000,
  cleaning_lead: 4_800_000,
  supervisor: 5_600_000,
  security_guard: 5_000_000,
  security_lead: 5_600_000,
  technician: 6_200_000,
  gardener: 4_400_000,
  pest_technician: 5_200_000,
  receptionist: 4_500_000,
  kitchen_staff: 4_400_000,
  laundry_staff: 4_200_000,
  office_support: 4_200_000,
  driver: 4_800_000,
}

const PUBLIC_RULES: MockContractRules = {
  shortfallDeductionPercent: 100,
  shortfallPenaltyPerPersonDay: 50_000,
  vatRate: 20,
  priceAdjustment: {
    kind: "min_wage",
    laborSharePercent: 100,
    ratePercent: null,
    effectiveFrom: null,
  },
  penalties: [
    {
      code: "KYF",
      label: "Kıyafet ve teçhizat eksikliği",
      kind: "fixed",
      amount: 100_000,
    },
    {
      code: "DNT",
      label: "Denetim tutanağıyla tespit edilen aksaklık",
      kind: "percent",
      amount: 0.5,
    },
  ],
}

const PRIVATE_RULES: MockContractRules = {
  shortfallDeductionPercent: 100,
  shortfallPenaltyPerPersonDay: 0,
  vatRate: 20,
  priceAdjustment: {
    kind: "none",
    laborSharePercent: 100,
    ratePercent: null,
    effectiveFrom: null,
  },
  penalties: [{ code: "SLA", label: "SLA ihlali", kind: "percent", amount: 1 }],
}

const STAFFING_RULES: MockContractRules = {
  ...PRIVATE_RULES,
  priceAdjustment: {
    kind: "min_wage",
    laborSharePercent: 80,
    ratePercent: null,
    effectiveFrom: null,
  },
  penalties: [],
}

export const templateId = (tenantId: string, key: string) =>
  `cts-${tenantId}-${key}`

/** Hazır sözleşme şablonları (Puantio kütüphanesi) */
export function buildContractTemplates(
  tenantId: string
): MockContractTemplate[] {
  const updatedAt = SEED_REFERENCE_DATE.toISOString()
  return [
    {
      id: templateId(tenantId, "kamu"),
      tenantId,
      name: "Kamu ihalesi (KİK)",
      description:
        "Eksik personel günü ödenmez ve kişi-gün başı ceza kesilir; işçilik fiyat farkı asgari ücret artışına göre (KİK md. 83).",
      contractType: "public_tender",
      builtIn: true,
      rules: structuredClone(PUBLIC_RULES),
      updatedAt,
    },
    {
      id: templateId(tenantId, "ozel"),
      tenantId,
      name: "Özel sözleşme",
      description:
        "Eksik personel günü ödenmez; fiyat farkı yok veya sabit oranlı zam.",
      contractType: "private",
      builtIn: true,
      rules: structuredClone(PRIVATE_RULES),
      updatedAt,
    },
    {
      id: templateId(tenantId, "temin"),
      tenantId,
      name: "Personel temini",
      description:
        "Kişi/ay fiyat; asgari ücret artışı işçilik payına (%80) yansır. Puantaj müşteri onayı ister.",
      contractType: "staffing",
      builtIn: true,
      rules: structuredClone(STAFFING_RULES),
      updatedAt,
    },
  ]
}

const YEAR_START = "2026-01-01"
const YEAR_END = "2026-12-31"

/**
 * Müşteri başına bir sözleşme: personeli olan lokasyonları kapsar, taahhüt kadro o
 * lokasyondaki personel sayısıdır (pozisyon bazında). Her üçüncü sözleşmede 1 Temmuz'da
 * %8 fiyat artışlı zeyilname vardır. Personel temini hattındaki lokasyonlar ayrı bir
 * personel temini sözleşmesine bağlanır (puantaj müşteri onayı bu sözleşmeden gelir).
 */
export function buildContracts(
  tenant: MockTenant,
  data: TenantMasterData,
  templates: readonly MockContractTemplate[]
): MockContract[] {
  const tenantId = tenant.slug
  const rotation = tenantId === "guvenlik"
  const byLocation = new Map<string, Map<Position, number>>()
  const legalEntityByLocation = new Map<string, string>()
  for (const person of data.personnel) {
    if (!person.homeLocationId || person.isFloater) continue
    if (person.status === "terminated") continue
    let positions = byLocation.get(person.homeLocationId)
    if (!positions) {
      positions = new Map()
      byLocation.set(person.homeLocationId, positions)
    }
    positions.set(person.position, (positions.get(person.position) ?? 0) + 1)
    if (!legalEntityByLocation.has(person.homeLocationId))
      legalEntityByLocation.set(person.homeLocationId, person.legalEntityId)
  }
  const template = (type: MockContract["type"]) =>
    templates.find((item) => item.contractType === type)!

  const contracts: MockContract[] = []
  const createdAt = SEED_REFERENCE_DATE.toISOString()
  let sequence = 0
  const add = (
    customerId: string,
    locationIds: string[],
    type: MockContract["type"],
    title: string
  ) => {
    if (locationIds.length === 0) return
    sequence += 1
    const key = `${tenantId}:contract:${sequence}`
    const commitments = locationIds.flatMap((locationId) =>
      [...(byLocation.get(locationId) ?? new Map<Position, number>())].map(
        ([position, count]) => ({
          locationId,
          position,
          headcount: rotation
            ? Math.max(1, Math.round((count * 2) / 3))
            : count,
          coverage: rotation ? ("all_days" as const) : ("six_days" as const),
        })
      )
    )
    const positions = [...new Set(commitments.map((item) => item.position))]
    const rules = structuredClone(template(type).rules)
    const base: MockContractVersion = {
      id: `ctv-${tenantId}-${sequence}-0`,
      number: 0,
      effectiveFrom: YEAR_START,
      effectiveTo: YEAR_END,
      note: null,
      createdAt,
      createdBy: "Sistem",
      serviceLines: [
        ...new Set(
          data.locations
            .filter((location) => locationIds.includes(location.id))
            .flatMap((location) => location.serviceLines)
        ),
      ],
      scopeItems: [],
      locations: locationIds.map((locationId) => ({
        locationId,
        from: YEAR_START,
        to: null,
      })),
      commitments,
      prices: {
        unitPrices: positions.map((position) => ({
          position,
          monthly: MOCK_UNIT_PRICES[position],
        })),
        overtimeHourly: 30_000,
        materialMonthly: 150_000 * locationIds.length,
      },
      rules,
    }
    const versions = [base]
    if (sequence % 3 === 0) {
      base.effectiveTo = "2026-06-30"
      versions.push({
        ...structuredClone(base),
        id: `ctv-${tenantId}-${sequence}-1`,
        number: 1,
        effectiveFrom: "2026-07-01",
        effectiveTo: YEAR_END,
        note: "Yıllık fiyat revizyonu (%8)",
        prices: {
          ...base.prices,
          unitPrices: base.prices.unitPrices.map((item) => ({
            ...item,
            monthly: Math.round((item.monthly * 1.08) / 100) * 100,
          })),
        },
      })
    }
    contracts.push({
      id: `ct-${tenantId}-${sequence}`,
      tenantId,
      code: `SOZ-2026-${String(sequence).padStart(3, "0")}`,
      title,
      type,
      ikn:
        type === "public_tender"
          ? `2025/${randInt(`${key}:ikn`, 100_000, 999_999)}`
          : null,
      customerId,
      contractorLegalEntityId:
        legalEntityByLocation.get(locationIds[0]!) ?? data.legalEntities[0]!.id,
      startDate: YEAR_START,
      endDate: YEAR_END,
      terminatedAt: null,
      templateId: template(type).id,
      versions,
      updatedAt: createdAt,
    })
  }

  for (const customer of data.customers) {
    const locations = data.locations.filter(
      (location) =>
        location.customerId === customer.id && byLocation.has(location.id)
    )
    const staffing = locations.filter((location) =>
      location.serviceLines.includes("staffing")
    )
    const regular = locations.filter(
      (location) => !location.serviceLines.includes("staffing")
    )
    add(
      customer.id,
      regular.map((location) => location.id),
      customer.type === "public" ? "public_tender" : "private",
      `${customer.name} hizmet sözleşmesi`
    )
    add(
      customer.id,
      staffing.map((location) => location.id),
      "staffing",
      `${customer.name} personel temini`
    )
  }
  // Bir sözleşme 2025'te bitmiş (geçmiş kayıt örneği)
  const old = contracts.find((contract) => rand(contract.id) < 0.3)
  if (old && contracts.length > 2) {
    contracts.push({
      ...structuredClone(old),
      id: `${old.id}-2025`,
      code: old.code.replace("2026", "2025"),
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      versions: old.versions.slice(0, 1).map((version) => ({
        ...version,
        id: `${version.id}-2025`,
        effectiveFrom: "2025-01-01",
        effectiveTo: "2025-12-31",
        locations: version.locations.map((location) => ({
          ...location,
          from: "2025-01-01",
        })),
      })),
    })
  }
  return contracts
}
