import { z } from "zod"

/**
 * Branded ID şeması üretir: `PersonnelId` ile `LocationId` birbirinin yerine geçemez.
 *
 * @example
 * export const personnelIdSchema = brandedId("PersonnelId")
 * export type PersonnelId = z.infer<typeof personnelIdSchema>
 */
export function brandedId<const TBrand extends string>(brand: TBrand) {
  return z.string().min(1).brand(brand)
}
