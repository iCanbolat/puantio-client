import { PAYROLL_LIBRARY } from "@/features/payroll-export/domain/library"
import type { LibraryKey } from "@/features/payroll-export/model/profile"

import { SEED_REFERENCE_DATE } from "../factories/faker"
import type { MockPayrollProfile } from "../db/types"

/** Platform kütüphanesindeki hazır profillerin kiracı kopyaları */
export function buildPayrollProfiles(tenantId: string): MockPayrollProfile[] {
  const entries: [string, LibraryKey][] = [
    ["logo", "logo-bordro-plus"],
    ["generic", "generic-csv"],
  ]
  return entries.map(([key, libraryKey]) => {
    const library = PAYROLL_LIBRARY[libraryKey]
    return {
      id: `pp-${tenantId}-${key}`,
      tenantId,
      ...structuredClone(library.settings),
      libraryKey,
      simulated: library.simulated,
      updatedAt: SEED_REFERENCE_DATE.toISOString(),
    }
  })
}
