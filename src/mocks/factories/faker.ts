import { fakerTR } from "@faker-js/faker"

/**
 * Tüm mock verisi bu faker örneğinden üretilir. Aynı seed her zaman aynı veriyi üretir
 * (testler ve E2E senaryoları deterministik). Tarihler sabit referans tarihine göre üretilir.
 */
export const faker = fakerTR

export const DEFAULT_SEED = 42
export const SEED_REFERENCE_DATE = new Date("2026-09-01T09:00:00+03:00")

export function resetFaker(seed: number = DEFAULT_SEED): void {
  faker.seed(seed)
  faker.setDefaultRefDate(SEED_REFERENCE_DATE)
}

/** Türkiye'de il merkezleri (yaklaşık koordinatlar) — lokasyon üretimi için. */
export const TR_CITIES = [
  { name: "İstanbul", lat: 41.0082, lng: 28.9784 },
  { name: "Ankara", lat: 39.9334, lng: 32.8597 },
  { name: "İzmir", lat: 38.4237, lng: 27.1428 },
  { name: "Bursa", lat: 40.1885, lng: 29.061 },
  { name: "Antalya", lat: 36.8969, lng: 30.7133 },
  { name: "Adana", lat: 37.0, lng: 35.3213 },
  { name: "Konya", lat: 37.8746, lng: 32.4932 },
  { name: "Gaziantep", lat: 37.0662, lng: 37.3833 },
  { name: "Kayseri", lat: 38.7205, lng: 35.4826 },
  { name: "Samsun", lat: 41.2867, lng: 36.33 },
  { name: "Eskişehir", lat: 39.7767, lng: 30.5206 },
  { name: "Trabzon", lat: 41.0015, lng: 39.7178 },
  { name: "Diyarbakır", lat: 37.9144, lng: 40.2306 },
  { name: "Şanlıurfa", lat: 37.1591, lng: 38.7969 },
  { name: "Çanakkale", lat: 40.1553, lng: 26.4142 },
  { name: "Muğla", lat: 37.2153, lng: 28.3636 },
] as const

/** İl merkezine en fazla ~`spreadKm` uzaklıkta rastgele bir nokta. */
export function randomPointNear(
  center: { lat: number; lng: number },
  spreadKm = 8
): { lat: number; lng: number } {
  const dLat = faker.number.float({ min: -1, max: 1 }) * (spreadKm / 111)
  const dLng =
    faker.number.float({ min: -1, max: 1 }) *
    (spreadKm / (111 * Math.cos((center.lat * Math.PI) / 180)))
  return {
    lat: Number((center.lat + dLat).toFixed(6)),
    lng: Number((center.lng + dLng).toFixed(6)),
  }
}
