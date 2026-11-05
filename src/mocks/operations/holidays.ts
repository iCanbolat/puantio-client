/**
 * Resmi tatiller (mock `GET /holidays?year=`). Dini bayramlar her yıl değişir; gerçek
 * backend Diyanet takviminden üretir. Arefe günleri 13:00'ten sonra tatildir (yarım gün).
 */
export interface Holiday {
  date: string
  name: string
  kind: "full" | "half"
}

const FIXED: { md: string; name: string }[] = [
  { md: "01-01", name: "Yılbaşı" },
  { md: "04-23", name: "Ulusal Egemenlik ve Çocuk Bayramı" },
  { md: "05-01", name: "Emek ve Dayanışma Günü" },
  { md: "05-19", name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { md: "07-15", name: "Demokrasi ve Millî Birlik Günü" },
  { md: "08-30", name: "Zafer Bayramı" },
  { md: "10-29", name: "Cumhuriyet Bayramı" },
]

/** Arefe + bayram günleri */
const RELIGIOUS: Record<
  number,
  { eve: string; days: string[]; name: string }[]
> = {
  2025: [
    {
      eve: "03-29",
      days: ["03-30", "03-31", "04-01"],
      name: "Ramazan Bayramı",
    },
    {
      eve: "06-05",
      days: ["06-06", "06-07", "06-08", "06-09"],
      name: "Kurban Bayramı",
    },
  ],
  2026: [
    {
      eve: "03-19",
      days: ["03-20", "03-21", "03-22"],
      name: "Ramazan Bayramı",
    },
    {
      eve: "05-26",
      days: ["05-27", "05-28", "05-29", "05-30"],
      name: "Kurban Bayramı",
    },
  ],
  2027: [
    {
      eve: "03-08",
      days: ["03-09", "03-10", "03-11"],
      name: "Ramazan Bayramı",
    },
    {
      eve: "05-15",
      days: ["05-16", "05-17", "05-18", "05-19"],
      name: "Kurban Bayramı",
    },
  ],
}

const cache = new Map<number, Holiday[]>()

export function holidaysOf(year: number): Holiday[] {
  const cached = cache.get(year)
  if (cached) return cached
  const list: Holiday[] = FIXED.map((item) => ({
    date: `${year}-${item.md}`,
    name: item.name,
    kind: "full" as const,
  }))
  list.push({
    date: `${year}-10-28`,
    name: "Cumhuriyet Bayramı arefesi",
    kind: "half",
  })
  for (const feast of RELIGIOUS[year] ?? []) {
    list.push({
      date: `${year}-${feast.eve}`,
      name: `${feast.name} arefesi`,
      kind: "half",
    })
    feast.days.forEach((md, index) => {
      list.push({
        date: `${year}-${md}`,
        name: `${feast.name} ${index + 1}. gün`,
        kind: "full",
      })
    })
  }
  list.sort((a, b) => a.date.localeCompare(b.date))
  cache.set(year, list)
  return list
}

export function holidayOn(date: string): Holiday | null {
  const year = Number(date.slice(0, 4))
  return holidaysOf(year).find((holiday) => holiday.date === date) ?? null
}

export function holidaysBetween(from: string, to: string): Holiday[] {
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])
  return [...years]
    .flatMap((year) => holidaysOf(year))
    .filter((holiday) => holiday.date >= from && holiday.date <= to)
}
