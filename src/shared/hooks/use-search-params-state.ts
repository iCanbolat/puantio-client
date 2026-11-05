import { useCallback, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router"
import type { z } from "zod"

import { searchParamsToObject } from "@/shared/lib/search-params"

type SearchSchema = z.ZodObject

type Serializable =
  string | number | boolean | null | undefined | readonly (string | number)[]

export function parseSearchParams<TSchema extends SearchSchema>(
  schema: TSchema,
  params: URLSearchParams
): z.output<TSchema> {
  const raw = searchParamsToObject(params)
  const result = schema.safeParse(raw)
  // Şemalar `.catch()` ile tanımlandığından geçersiz değerler varsayılana düşer;
  // yine de başarısızsa tamamen varsayılanlara dön.
  return result.success ? result.data : schema.parse({})
}

function isEmpty(value: Serializable): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
}

function isSameValue(a: Serializable, b: Serializable): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index])
  }
  return a === b
}

/**
 * Şemadaki anahtarları URL'ye yazar. Varsayılan değerler ve boş değerler URL'den çıkarılır
 * (paylaşılabilir, temiz URL). Şemada olmayan parametrelere dokunulmaz.
 */
export function writeSearchParams(
  schema: SearchSchema,
  base: URLSearchParams,
  values: Record<string, Serializable>
): URLSearchParams {
  const next = new URLSearchParams(base)
  const defaults = schema.parse({}) as Record<string, Serializable>
  for (const key of Object.keys(schema.shape)) {
    next.delete(key)
    const value = values[key]
    if (isEmpty(value) || isSameValue(value, defaults[key])) continue
    if (typeof value === "object" && value !== null) {
      for (const item of value) next.append(key, String(item))
    } else if (value !== undefined && value !== null) {
      next.set(key, String(value))
    }
  }
  return next
}

export interface SetSearchStateOptions {
  /** Geçmişe yeni kayıt eklemek yerine mevcut kaydı değiştir (filtre yazarken). */
  replace?: boolean
}

/**
 * URL'yi tipli state olarak kullanır. Filtre, sayfa ve sıralama URL'de tutulur;
 * sayfa yenilendiğinde veya link paylaşıldığında aynı görünüm açılır.
 *
 * @example
 * const schema = z.object({ page: z.coerce.number().catch(1), q: z.string().optional() })
 * const [search, setSearch] = useSearchParamsState(schema)
 * setSearch({ q: "ankara", page: 1 })
 */
export function useSearchParamsState<TSchema extends SearchSchema>(
  schema: TSchema
) {
  const [searchParams, setSearchParams] = useSearchParams()
  // Router geçişleri asenkron commit edilir. Commit'ten önce gelen ardışık güncellemeler
  // (çift tıklama, sıralamadan hemen sonra sayfa değişimi) birbirini ezmesin diye bu hook'un
  // ürettiği ama henüz URL'ye yansımamış zincir tutulur.
  const pendingRef = useRef<{
    latest: URLSearchParams
    produced: Set<string>
  } | null>(null)

  useEffect(() => {
    const pending = pendingRef.current
    if (!pending) return
    const current = searchParams.toString()
    // URL son değere ulaştı ya da dışarıdan (geri tuşu, link) değişti → zinciri bırak.
    // Zincirdeki ara bir değerse (eski render'ın gecikmeli effect'i) → koru.
    if (
      current === pending.latest.toString() ||
      !pending.produced.has(current)
    ) {
      pendingRef.current = null
    }
  }, [searchParams])

  const commit = useCallback(
    (next: URLSearchParams, replace: boolean) => {
      const pending = pendingRef.current
      const produced = pending?.produced ?? new Set([searchParams.toString()])
      produced.add(next.toString())
      pendingRef.current = { latest: next, produced }
      setSearchParams(next, { replace })
    },
    [searchParams, setSearchParams]
  )

  const state = useMemo(
    () => parseSearchParams(schema, searchParams),
    [schema, searchParams]
  )

  const setState = useCallback(
    (
      patch:
        | Partial<z.output<TSchema>>
        | ((previous: z.output<TSchema>) => Partial<z.output<TSchema>>),
      options: SetSearchStateOptions = {}
    ) => {
      const base = pendingRef.current?.latest ?? searchParams
      const current = parseSearchParams(schema, base)
      const resolved = typeof patch === "function" ? patch(current) : patch
      const next = writeSearchParams(schema, base, {
        ...current,
        ...resolved,
      } as Record<string, Serializable>)
      commit(next, options.replace ?? false)
    },
    [schema, searchParams, commit]
  )

  const reset = useCallback(() => {
    const base = pendingRef.current?.latest ?? searchParams
    commit(writeSearchParams(schema, base, {}), false)
  }, [schema, searchParams, commit])

  return [state, setState, reset] as const
}
