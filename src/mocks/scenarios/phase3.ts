import { db } from "../db"
import type { MockContract, MockPersonnel } from "../db/types"
import { ops } from "../operations/store"
import { MOCK_UNIT_PRICES } from "../contracts/seed"
import { scenarioLocationId } from "./phase2"
import { defineScenario } from "./types"

/** Kadro senaryosu: taahhüt 50 + 40 + 30 = 120, eksiksiz gelen personel 46 + 38 + 28 = 112 */
export const SHORTFALL_LAYOUT = [
  { committed: 50, present: 46 },
  { committed: 40, present: 38 },
  { committed: 30, present: 28 },
] as const

export const shortfallContractId = (tenantId: string) => `ct-${tenantId}-kadro`

function tenants() {
  return db.tenants.findMany((tenant) => tenant.kind === "tenant")
}

function setupShortfall(): void {
  const steady = new Set<string>()
  for (const tenant of tenants()) {
    const baseId = scenarioLocationId(tenant.slug)
    const base = baseId ? db.locations.findById(baseId) : undefined
    const entity = db.legalEntities.findFirst(
      (item) => item.tenantId === tenant.slug
    )
    const template = db.personnel.findFirst(
      (person) => person.tenantId === tenant.slug && !person.isFloater
    )
    if (!base || !entity || !template) continue
    const locationIds = SHORTFALL_LAYOUT.map((layout, index) => {
      const id = `${base.id}-kadro-${index + 1}`
      db.locations.insert({
        ...structuredClone(base),
        id,
        code: `KDR-${index + 1}`,
        name: `Kadro Kampüsü ${String.fromCharCode(65 + index)} Blok`,
        targetHeadcount: layout.committed,
        serviceLines: ["cleaning"],
      })
      for (let n = 0; n < layout.present; n += 1) {
        const person: MockPersonnel = {
          ...structuredClone(template),
          id: `${id}-p${n + 1}`,
          employeeNumber: `K${index + 1}${String(n + 1).padStart(3, "0")}`,
          firstName: template.firstName,
          lastName: `${template.lastName} ${index + 1}-${n + 1}`,
          position: "cleaning_staff",
          serviceLine: "cleaning",
          legalEntityId: entity.id,
          homeLocationId: id,
          isFloater: false,
          status: "active",
          hireDate: "2025-01-01",
          terminationDate: null,
        }
        db.personnel.insert(person)
        steady.add(person.id)
      }
      return id
    })
    const contract: MockContract = {
      id: shortfallContractId(tenant.slug),
      tenantId: tenant.slug,
      code: "SOZ-2026-900",
      title: "Kadro Kampüsü temizlik hizmeti",
      type: "private",
      ikn: null,
      customerId: base.customerId,
      contractorLegalEntityId: entity.id,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      terminatedAt: null,
      templateId: null,
      versions: [
        {
          id: `${shortfallContractId(tenant.slug)}-v0`,
          number: 0,
          effectiveFrom: "2026-01-01",
          effectiveTo: "2026-12-31",
          note: null,
          createdAt: "2026-01-01T09:00:00+03:00",
          createdBy: "Sistem",
          serviceLines: ["cleaning"],
          scopeItems: [
            {
              serviceLine: "cleaning",
              description: "Genel alan ve ofis temizliği",
            },
          ],
          locations: locationIds.map((locationId) => ({
            locationId,
            from: "2026-01-01",
            to: null,
          })),
          commitments: locationIds.map((locationId, index) => ({
            locationId,
            position: "cleaning_staff" as const,
            headcount: SHORTFALL_LAYOUT[index]!.committed,
            coverage: "six_days" as const,
          })),
          prices: {
            unitPrices: [
              {
                position: "cleaning_staff",
                monthly: MOCK_UNIT_PRICES.cleaning_staff,
              },
            ],
            overtimeHourly: 30_000,
            materialMonthly: 0,
          },
          rules: structuredClone(
            db.contractTemplates.findFirst(
              (item) =>
                item.tenantId === tenant.slug && item.contractType === "private"
            )!.rules
          ),
        },
      ],
      updatedAt: "2026-01-01T09:00:00+03:00",
    }
    db.contracts.insert(contract)
  }
  ops.flags.steadyPersonnelIds = steady
}

export const phase3Scenarios = [
  defineScenario({
    id: "headcount-shortfall",
    label: "Kadro taahhüt açığı",
    description:
      "Kadro Kampüsü sözleşmesinde 3 blokta taahhüt 120 kişi, her gün eksiksiz gelen personel 112 kişi. Kadro raporunda −8 (%6,7).",
    phase: 3,
    setup: setupShortfall,
  }),
  defineScenario({
    id: "price-change-mid-month",
    label: "Ay ortasında fiyat değişikliği",
    description:
      "Kiracının ilk sözleşmesine 15 Eylül 2026'da yürürlüğe giren %10 fiyat artışlı zeyilname eklenir; Eylül hakedişi kıst hesaplanır.",
    phase: 3,
    setup: () => {
      for (const tenant of tenants()) {
        const contract = db.contracts.findById(`ct-${tenant.slug}-1`)
        if (!contract) continue
        const last = contract.versions.at(-1)!
        const versions = [
          ...contract.versions.slice(0, -1),
          { ...last, effectiveTo: "2026-09-14" },
          {
            ...structuredClone(last),
            id: `${contract.id}-v-fiyat`,
            number: last.number + 1,
            effectiveFrom: "2026-09-15",
            effectiveTo: contract.endDate,
            note: "Fiyat revizyonu (%10)",
            prices: {
              ...last.prices,
              unitPrices: last.prices.unitPrices.map((item) => ({
                ...item,
                monthly: Math.round((item.monthly * 1.1) / 100) * 100,
              })),
            },
          },
        ]
        db.contracts.update(contract.id, { versions })
      }
    },
  }),
  defineScenario({
    id: "stale-progress-payment",
    label: "Güncel olmayan hakediş",
    description:
      "İlk sözleşmenin geçen ay hakediş taslağı hazır; taslaktan sonra bir personelin bir günü puantajda devamsız olarak düzeltilir. Hakediş 'Güncel değil' uyarısı verir.",
    phase: 3,
    setup: () => {
      ops.flags.noise = false
      ops.flags.missingCheckouts = false
      ops.flags.stalePaymentTenants = new Set(
        tenants().map((tenant) => tenant.slug)
      )
    },
  }),
]
