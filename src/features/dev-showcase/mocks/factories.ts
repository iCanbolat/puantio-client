import { faker, TR_CITIES, randomPointNear } from "@/mocks/factories/faker"
import { kurus } from "@/shared/lib/money"

import {
  SHOWCASE_CATEGORIES,
  type ShowcaseCategory,
  type ShowcaseRecord,
  type ShowcaseRecordId,
} from "../model/showcase-record"

// Kurgusal isimler: gerçek kurum adları kullanılmaz.
const NAME_PARTS: Record<
  ShowcaseCategory,
  { prefixes: string[]; suffix: string }
> = {
  banka: {
    prefixes: [
      "Anadolu Katılım",
      "Boğaziçi",
      "Ege Yatırım",
      "Kuzey Kredi",
      "Toros",
    ],
    suffix: "Bankası Şubesi",
  },
  hastane: {
    prefixes: [
      "Yeşilvadi",
      "Şifa",
      "Park Tıp",
      "Güneşli Devlet",
      "Sahil Eğitim ve Araştırma",
    ],
    suffix: "Hastanesi",
  },
  havalimani: {
    prefixes: ["Dış Hatlar", "İç Hatlar", "Kargo", "Genel Havacılık"],
    suffix: "Terminali",
  },
  kamu: {
    prefixes: [
      "Vergi Dairesi",
      "Adliye",
      "İl Sağlık Müdürlüğü",
      "SGK İl Müdürlüğü",
      "Belediye Hizmet",
    ],
    suffix: "Binası",
  },
  ofis: {
    prefixes: ["Kule", "Vadi", "Merkez", "Nova", "Atlas"],
    suffix: "Plaza",
  },
}

const HEADCOUNT_RANGE: Record<ShowcaseCategory, [number, number]> = {
  banka: [1, 3],
  hastane: [12, 80],
  havalimani: [20, 120],
  kamu: [2, 15],
  ofis: [3, 25],
}

/** Kişi başı aylık birim fiyat aralığı (TL). */
const UNIT_PRICE_TL: [number, number] = [28_000, 42_000]

export function buildShowcaseRecord(
  index: number,
  overrides: Partial<ShowcaseRecord> = {}
): ShowcaseRecord {
  const category = faker.helpers.arrayElement(SHOWCASE_CATEGORIES)
  const city = faker.helpers.arrayElement(TR_CITIES)
  const parts = NAME_PARTS[category]
  const [minHead, maxHead] = HEADCOUNT_RANGE[category]
  const headcount = faker.number.int({ min: minHead, max: maxHead })
  const unitPrice = faker.number.int({
    min: UNIT_PRICE_TL[0],
    max: UNIT_PRICE_TL[1],
  })

  return {
    id: faker.string.uuid() as ShowcaseRecordId,
    code: `WLC-${String(index + 1).padStart(5, "0")}`,
    name: `${faker.helpers.arrayElement(parts.prefixes)} ${city.name} ${parts.suffix}`,
    city: city.name,
    category,
    status: faker.helpers.weightedArrayElement([
      { weight: 80, value: "aktif" as const },
      { weight: 12, value: "askida" as const },
      { weight: 8, value: "pasif" as const },
    ]),
    score: faker.number.int({ min: 55, max: 100 }),
    headcount,
    monthlyAmount: kurus(headcount * unitPrice * 100),
    position: randomPointNear(city),
    updatedAt: faker.date.recent({ days: 60 }).toISOString(),
    ...overrides,
  }
}

export function buildShowcaseRecords(count: number): ShowcaseRecord[] {
  return Array.from({ length: count }, (_, index) => buildShowcaseRecord(index))
}
