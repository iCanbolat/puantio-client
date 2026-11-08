import { db } from "../db"
import type { MockContract } from "../db/types"
import { buildContractTemplates } from "./seed"

/**
 * Testler için personel temini sözleşmesi ekler (puantaj müşteri onayı bu sözleşmeden
 * gelir). Taahhüt: lokasyon başına 1 temizlik personeli.
 */
export function addStaffingContract(
  tenantId: string,
  legalEntityId: string,
  locationIds: readonly string[],
  range: { from: string; to: string } = { from: "2026-01-01", to: "2026-12-31" }
): MockContract {
  const location = db.locations.findById(locationIds[0]!)!
  const rules = buildContractTemplates(tenantId).find(
    (template) => template.contractType === "staffing"
  )!.rules
  return db.contracts.insert({
    id: `ct-${tenantId}-temin-test-${db.contracts.count() + 1}`,
    tenantId,
    code: "SOZ-TEST-TEMIN",
    title: "Test personel temini",
    type: "staffing",
    ikn: null,
    customerId: location.customerId,
    contractorLegalEntityId: legalEntityId,
    startDate: range.from,
    endDate: range.to,
    terminatedAt: null,
    templateId: null,
    versions: [
      {
        id: "ctv-temin-test-0",
        number: 0,
        effectiveFrom: range.from,
        effectiveTo: range.to,
        note: null,
        createdAt: "2026-01-01T09:00:00+03:00",
        createdBy: "Test",
        serviceLines: ["staffing"],
        scopeItems: [],
        locations: locationIds.map((locationId) => ({
          locationId,
          from: range.from,
          to: null,
        })),
        commitments: locationIds.map((locationId) => ({
          locationId,
          position: "cleaning_staff" as const,
          headcount: 1,
          coverage: "six_days" as const,
        })),
        prices: {
          unitPrices: [{ position: "cleaning_staff", monthly: 4_000_000 }],
          overtimeHourly: 30_000,
          materialMonthly: 0,
        },
        rules,
      },
    ],
    updatedAt: "2026-01-01T09:00:00+03:00",
  })
}
