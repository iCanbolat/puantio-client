/**
 * Ürün markası için tek kaynak. Puantio çok kiracılı (SaaS) bir üründür: kiracının adı ve
 * logosu `GET /public/tenant-config` ile gelir ve kabuklarda ürün adının yanında gösterilir.
 * Ürün adı sabit metin olarak bileşenlere yazılmaz; buradan okunur.
 */
export const brand = {
  productName: "Puantio",
  tagline: "Operasyon Platformu",
  description:
    "Tesis hizmetleri için saha operasyonu, puantaj ve hakediş platformu",
} as const

const STORAGE_PREFIX = "puantio"

/**
 * Tarayıcı depolama anahtarı üretir: `puantio.<ad>` veya kiracı kapsamlı
 * `puantio.<kiracı>.<ad>`. Kiracı kapsamı sayesinde aynı tarayıcıda iki firmaya giren
 * kullanıcının tercihleri karışmaz. Tüm kalıcı anahtarlar bu fonksiyondan geçmelidir.
 */
export function storageKey(name: string, tenantSlug?: string): string {
  return tenantSlug
    ? `${STORAGE_PREFIX}.${tenantSlug}.${name}`
    : `${STORAGE_PREFIX}.${name}`
}
