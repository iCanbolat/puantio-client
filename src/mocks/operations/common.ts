import { descendantIds } from "@/entities/org-unit"
import { diffIsoDays } from "@/shared/lib/work-time"
import type { PaginationMeta } from "@/shared/types"

import { createScope, type AuthContext } from "../auth/context"
import { db } from "../db"
import type { MockLocation } from "../db/types"

/** Kullanıcının kapsamındaki (ve filtreye uyan) lokasyon kimlikleri */
export function scopedLocationIds(
  auth: AuthContext,
  filter: {
    orgUnitId?: string | undefined
    locationId?: string | undefined
  } = {}
): Set<string> {
  const scope = createScope(auth)
  const tenantId = auth.tenant.slug
  let units: Set<string> | null = null
  if (filter.orgUnitId) {
    const all = db.orgUnits.findMany((unit) => unit.tenantId === tenantId)
    units = descendantIds(all, filter.orgUnitId)
  }
  return new Set(
    db.locations
      .findMany(
        (location: MockLocation) =>
          scope.location(location) &&
          (!units || units.has(location.orgUnitId)) &&
          (!filter.locationId || location.id === filter.locationId)
      )
      .map((location) => location.id)
  )
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number
): { items: T[]; meta: PaginationMeta } {
  const total = items.length
  const pageCount = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    meta: { page, pageSize, total, pageCount },
  }
}

/** `from <= to` ve en fazla `maxDays` gün */
export function isoDateRangeValid(
  from: string,
  to: string,
  maxDays: number
): boolean {
  const days = diffIsoDays(from, to)
  return days >= 0 && days <= maxDays
}
