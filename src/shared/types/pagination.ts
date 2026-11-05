import { z } from "zod"

export const sortOrderSchema = z.enum(["asc", "desc"])
export type SortOrder = z.infer<typeof sortOrderSchema>

export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

/**
 * Liste endpoint'lerinin ortak sorgu parametreleri.
 * Hem istemci (URL state → istek) hem mock sunucu (istek → filtre) aynı şemayı kullanır.
 * Sayfa numarası 1 tabanlıdır.
 */
export const listParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (PAGE_SIZE_OPTIONS as readonly number[]).includes(value))
    .catch(DEFAULT_PAGE_SIZE),
  sort: z.string().min(1).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  q: z.string().trim().min(1).optional().catch(undefined),
})

export type ListParams = z.infer<typeof listParamsSchema>

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  pageCount: z.number().int().min(0),
})

export type PaginationMeta = z.infer<typeof paginationMetaSchema>

export function paginatedSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    meta: paginationMetaSchema,
  })
}

export interface Paginated<TItem> {
  items: TItem[]
  meta: PaginationMeta
}
