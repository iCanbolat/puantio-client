/** Deterministik sözde rastgele sayı: aynı anahtar her zaman aynı değeri verir (FNV-1a). */
export function rand(key: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x2c1b3c6d)
  hash ^= hash >>> 12
  return (hash >>> 0) / 0x1_0000_0000
}

/** [min, max] aralığında deterministik tam sayı */
export function randInt(key: string, min: number, max: number): number {
  return min + Math.floor(rand(key) * (max - min + 1))
}

export function pick<T>(key: string, items: readonly T[]): T {
  return items[Math.floor(rand(key) * items.length)] as T
}
