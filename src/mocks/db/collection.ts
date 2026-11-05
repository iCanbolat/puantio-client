import { compareTr, includesTr } from "@/shared/lib/format"
import type { ListParams, Paginated } from "@/shared/types"

export interface Entity {
  id: string
}

export interface QueryOptions<T> {
  where?: (item: T) => boolean
  /** `q` araması için taranacak alanlar (Türkçe harf duyarsız) */
  searchFields?: readonly (keyof T)[]
  /** Sıralanabilir alanlar. Listede olmayan `sort` değeri yok sayılır. */
  sortableFields?: readonly (keyof T)[]
  defaultSort?: { field: keyof T; order: "asc" | "desc" }
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "boolean" && typeof b === "boolean")
    return Number(a) - Number(b)
  const toText = (value: unknown) =>
    typeof value === "string" ? value : JSON.stringify(value)
  return compareTr(toText(a), toText(b))
}

/**
 * Tipli in-memory koleksiyon. MSW handler'ları bu koleksiyonlar üzerinden CRUD yapar;
 * sayfalama/sıralama/arama gerçek API ile aynı sözleşmeyi (`ListParams`) kullanır.
 */
export class Collection<T extends Entity> {
  private readonly items = new Map<string, T>()

  readonly name: string

  constructor(name: string) {
    this.name = name
  }

  insert(item: T): T {
    if (this.items.has(item.id)) {
      throw new Error(`[mock-db] ${this.name}: '${item.id}' zaten var`)
    }
    this.items.set(item.id, structuredClone(item))
    return structuredClone(item)
  }

  insertMany(items: readonly T[]): void {
    for (const item of items) this.insert(item)
  }

  findById(id: string): T | undefined {
    const item = this.items.get(id)
    return item ? structuredClone(item) : undefined
  }

  findFirst(where: (item: T) => boolean): T | undefined {
    for (const item of this.items.values()) {
      if (where(item)) return structuredClone(item)
    }
    return undefined
  }

  findMany(where?: (item: T) => boolean): T[] {
    const all = [...this.items.values()]
    return structuredClone(where ? all.filter(where) : all)
  }

  update(id: string, patch: Partial<Omit<T, "id">>): T | undefined {
    const current = this.items.get(id)
    if (!current) return undefined
    const next = { ...current, ...patch }
    this.items.set(id, next)
    return structuredClone(next)
  }

  remove(id: string): boolean {
    return this.items.delete(id)
  }

  count(where?: (item: T) => boolean): number {
    if (!where) return this.items.size
    let total = 0
    for (const item of this.items.values()) if (where(item)) total += 1
    return total
  }

  clear(): void {
    this.items.clear()
  }

  query(params: ListParams, options: QueryOptions<T> = {}): Paginated<T> {
    let rows = [...this.items.values()]
    if (options.where) rows = rows.filter(options.where)

    const { q } = params
    const searchFields = options.searchFields
    if (q && searchFields?.length) {
      rows = rows.filter((row) =>
        searchFields.some((field) => {
          const value = row[field]
          return (
            value !== undefined &&
            value !== null &&
            includesTr(String(value), q)
          )
        })
      )
    }

    const sortField =
      params.sort && options.sortableFields?.includes(params.sort as keyof T)
        ? (params.sort as keyof T)
        : options.defaultSort?.field
    const order = params.sort
      ? (params.order ?? "asc")
      : (options.defaultSort?.order ?? "asc")
    if (sortField) {
      const direction = order === "desc" ? -1 : 1
      rows.sort((a, b) => direction * compareValues(a[sortField], b[sortField]))
    }

    const total = rows.length
    const pageCount = Math.ceil(total / params.pageSize)
    const start = (params.page - 1) * params.pageSize
    return {
      items: structuredClone(rows.slice(start, start + params.pageSize)),
      meta: { page: params.page, pageSize: params.pageSize, total, pageCount },
    }
  }
}
