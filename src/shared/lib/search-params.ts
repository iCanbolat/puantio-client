/** URLSearchParams → düz nesne. Tekrarlanan anahtarlar diziye çevrilir (`?k=a&k=b` → `["a","b"]`). */
export function searchParamsToObject(
  params: URLSearchParams
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    result[key] = values.length > 1 ? values : (values[0] ?? "")
  }
  return result
}
