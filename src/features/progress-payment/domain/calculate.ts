import {
  intersectRange,
  plannedDates,
  plannedDaysInMonth,
  versionSegments,
  type Commitment,
  type ContractLocation,
  type ContractRules,
  type Prices,
} from "@/features/contracts"
import { POSITION_LABELS, type Position } from "@/entities/personnel"
import {
  addKurus,
  kurus,
  multiplyKurus,
  percentOf,
  roundHalfUp,
  type Kurus,
} from "@/shared/lib/money"
import { eachIsoDate, monthRange } from "@/shared/lib/work-time"

import type {
  Calculation,
  LineKind,
  ManualPenalty,
  ProgressPaymentLine,
} from "../model/progress-payment"

export interface CalculationVersion {
  number: number
  effectiveFrom: string
  effectiveTo: string
  locations: readonly Pick<
    ContractLocation,
    "locationId" | "locationName" | "from" | "to"
  >[]
  commitments: readonly Commitment[]
  prices: Prices
  rules: ContractRules
}

/** Lokasyon × pozisyon × gün çalışılan kişi-gün (puantaj kodlarından: N/FM = 1, YG = 0,5) */
export interface WorkedEntry {
  locationId: string
  position: Position
  date: string
  personDays: number
  overtimeHours: number
}

export interface MinWage {
  effectiveFrom: string
  grossMonthly: Kurus
}

export interface CalculationInput {
  month: string
  /** Asgari ücret fiyat farkının baz tarihi (kural boşsa sözleşme başlangıcı) */
  contractStartDate: string
  versions: readonly CalculationVersion[]
  worked: readonly WorkedEntry[]
  /** Tam gün resmi tatiller */
  fullHolidays: ReadonlySet<string>
  minWages: readonly MinWage[]
  penalties: readonly ManualPenalty[]
}

const round2 = (value: number) => Math.round(value * 100) / 100

/** Verilen tarihte yürürlükteki brüt asgari ücret */
export function minWageAt(
  wages: readonly MinWage[],
  date: string
): Kurus | null {
  let current: MinWage | null = null
  for (const wage of [...wages].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
  )) {
    if (wage.effectiveFrom <= date) current = wage
  }
  return current?.grossMonthly ?? null
}

/**
 * Bir planlı iş günü için fiyat farkı katsayısı.
 * - KİK md. 83 (asgari ücret): o gün geçerli asgari ücret ÷ baz tarihteki asgari ücret − 1
 * - Sabit oran: yürürlük tarihinden itibaren oran
 * Katsayı işçilik payıyla çarpılır.
 */
function adjustmentFactor(
  rules: ContractRules,
  input: CalculationInput,
  date: string
): number {
  const adjustment = rules.priceAdjustment
  const share = adjustment.laborSharePercent / 100
  switch (adjustment.kind) {
    case "none":
      return 0
    case "fixed_rate":
      return adjustment.effectiveFrom && date >= adjustment.effectiveFrom
        ? ((adjustment.ratePercent ?? 0) / 100) * share
        : 0
    case "min_wage": {
      const base = minWageAt(
        input.minWages,
        adjustment.effectiveFrom ?? input.contractStartDate
      )
      const current = minWageAt(input.minWages, date)
      if (!base || !current || current <= base) return 0
      return (current / base - 1) * share
    }
  }
}

/**
 * Aylık hakediş hesabı (saf fonksiyon; mock sunucu ve önizleme aynı kodu kullanır).
 *
 * Her sürüm dilimi × taahhüt (lokasyon × pozisyon) için:
 * 1. **İşçilik** = kişi/ay fiyatı × taahhüt kadro × (dilimdeki planlı gün ÷ ayın planlı günü).
 *    Dönem içi fiyat değişikliği ve dönem ortasında kapsamdan çıkan lokasyon bu oranla kıst
 *    hesaplanır.
 * 2. **Eksik personel kesintisi** = eksik kişi-gün × (kişi/ay fiyatı ÷ ayın planlı günü) ×
 *    kesinti oranı. Eksik kişi-gün = Σ gün max(0, taahhüt − çalışılan); taahhüt üstü
 *    çalışma ödenmez.
 * 3. **Eksik personel cezası** = eksik kişi-gün × kişi-gün başı ceza.
 * 4. **Fiyat farkı** = (işçilik − kesinti) × planlı günlerin ortalama fiyat farkı katsayısı.
 * Ayrıca dilim başına fazla mesai (saat × saat ücreti) ve malzeme (aylık bedel × takvim günü
 * oranı); sonda elle girilen cezalar, KDV ve genel toplam.
 *
 * Yuvarlama: her satır kuruşa ayrı yuvarlanır (yarım yukarı, `multiplyKurus`); toplamlar
 * yuvarlanmış satırlardan toplanır.
 */
export function calculateProgressPayment(input: CalculationInput): Calculation {
  const range = monthRange(input.month)
  const monthDays = eachIsoDate(range.from, range.to).length
  const worked = new Map<string, number>()
  const overtime = new Map<string, number>()
  for (const entry of input.worked) {
    const key = `${entry.locationId}|${entry.position}|${entry.date}`
    worked.set(key, (worked.get(key) ?? 0) + entry.personDays)
    const otKey = `${entry.locationId}|${entry.date}`
    overtime.set(otKey, (overtime.get(otKey) ?? 0) + entry.overtimeHours)
  }

  const lines: ProgressPaymentLine[] = []
  const stats = {
    committedPersonDays: 0,
    workedPersonDays: 0,
    shortfallPersonDays: 0,
    excessPersonDays: 0,
    overtimeHours: 0,
  }
  let laborNet = 0
  const segments = versionSegments(
    input.versions.map((version) => ({
      ...version,
      id: String(version.number),
    })),
    input.month
  )
  const push = (
    line: Omit<ProgressPaymentLine, "key"> & { keyParts: (string | number)[] }
  ) => {
    const { keyParts, ...rest } = line
    lines.push({ key: [line.kind, ...keyParts].join("|"), ...rest })
  }

  for (const segment of segments) {
    const version = segment.version
    const rules = version.rules
    const locations = new Map(
      version.locations.map((location) => [location.locationId, location])
    )
    let segmentAdjustment = 0
    let adjustmentWeight = 0
    let adjustmentBase = 0

    for (const commitment of version.commitments) {
      const location = locations.get(commitment.locationId)
      const price = version.prices.unitPrices.find(
        (item) => item.position === commitment.position
      )
      if (!location || !price) continue
      const scope = intersectRange(location, segment)
      if (!scope) continue
      const days = plannedDates(commitment.coverage, scope, input.fullHolidays)
      const monthPlanned = plannedDaysInMonth(
        commitment.coverage,
        input.month,
        input.fullHolidays
      )
      if (days.length === 0 || monthPlanned === 0) continue

      const headcount = commitment.headcount
      const ratio = days.length / monthPlanned
      const labor = multiplyKurus(price.monthly, headcount * ratio)
      const base = {
        locationId: location.locationId,
        locationName: location.locationName,
        position: commitment.position,
        versionNumber: version.number,
        from: scope.from,
        to: scope.to,
      }
      const keyParts = [
        location.locationId,
        commitment.position,
        version.number,
      ]
      const name = `${POSITION_LABELS[commitment.position]} · ${location.locationName}`
      push({
        ...base,
        keyParts,
        kind: "labor",
        label: name,
        quantity: round2(headcount * ratio),
        unit: "kişi-ay",
        unitPrice: price.monthly,
        amount: labor,
      })

      let workedDays = 0
      let shortfall = 0
      let excess = 0
      let factorSum = 0
      for (const date of days) {
        const value =
          worked.get(`${location.locationId}|${commitment.position}|${date}`) ??
          0
        workedDays += Math.min(value, headcount)
        shortfall += Math.max(0, headcount - value)
        excess += Math.max(0, value - headcount)
        factorSum += adjustmentFactor(rules, input, date)
      }
      stats.committedPersonDays += headcount * days.length
      stats.workedPersonDays += workedDays
      stats.shortfallPersonDays += shortfall
      stats.excessPersonDays += excess

      let deduction = kurus(0)
      if (shortfall > 0 && rules.shortfallDeductionPercent > 0) {
        deduction = multiplyKurus(
          price.monthly,
          -(shortfall / monthPlanned) * (rules.shortfallDeductionPercent / 100)
        )
        push({
          ...base,
          keyParts,
          kind: "shortfall",
          label: `${name} · ${formatQuantity(shortfall)} eksik kişi-gün`,
          quantity: round2(shortfall),
          unit: "kişi-gün",
          unitPrice: kurus(roundHalfUp(price.monthly / monthPlanned)),
          amount: deduction,
        })
      }
      if (shortfall > 0 && rules.shortfallPenaltyPerPersonDay > 0) {
        push({
          ...base,
          keyParts,
          kind: "shortfall_penalty",
          label: `${name} · eksik personel cezası`,
          quantity: round2(shortfall),
          unit: "kişi-gün",
          unitPrice: rules.shortfallPenaltyPerPersonDay,
          amount: multiplyKurus(rules.shortfallPenaltyPerPersonDay, -shortfall),
        })
      }
      const net = labor + deduction
      laborNet += net
      const averageFactor = factorSum / days.length
      if (averageFactor > 0) {
        segmentAdjustment += multiplyKurus(kurus(net), averageFactor)
        adjustmentWeight += averageFactor * net
        adjustmentBase += net
      }
    }

    if (segmentAdjustment !== 0) {
      push({
        kind: "price_adjustment",
        keyParts: [version.number],
        label:
          rules.priceAdjustment.kind === "min_wage"
            ? "İşçilik fiyat farkı (KİK md. 83, asgari ücret)"
            : "Fiyat farkı (sabit oran)",
        locationId: null,
        locationName: null,
        position: null,
        versionNumber: version.number,
        from: segment.from,
        to: segment.to,
        quantity: round2(
          adjustmentBase === 0 ? 0 : (adjustmentWeight / adjustmentBase) * 100
        ),
        unit: "%",
        unitPrice: null,
        amount: kurus(segmentAdjustment),
      })
    }

    let hours = 0
    for (const date of eachIsoDate(segment.from, segment.to)) {
      for (const location of version.locations) {
        if (
          location.from > date ||
          (location.to !== null && location.to < date)
        )
          continue
        hours += overtime.get(`${location.locationId}|${date}`) ?? 0
      }
    }
    stats.overtimeHours += hours
    if (hours > 0 && version.prices.overtimeHourly > 0) {
      push({
        kind: "overtime",
        keyParts: [version.number],
        label: "Fazla mesai",
        locationId: null,
        locationName: null,
        position: null,
        versionNumber: version.number,
        from: segment.from,
        to: segment.to,
        quantity: hours,
        unit: "saat",
        unitPrice: version.prices.overtimeHourly,
        amount: multiplyKurus(version.prices.overtimeHourly, hours),
      })
    }

    if (version.prices.materialMonthly > 0) {
      const days = eachIsoDate(segment.from, segment.to).length
      push({
        kind: "material",
        keyParts: [version.number],
        label: "Malzeme bedeli",
        locationId: null,
        locationName: null,
        position: null,
        versionNumber: version.number,
        from: segment.from,
        to: segment.to,
        quantity: round2(days / monthDays),
        unit: "ay",
        unitPrice: version.prices.materialMonthly,
        amount: multiplyKurus(version.prices.materialMonthly, days / monthDays),
      })
    }
  }

  input.penalties.forEach((penalty, index) => {
    const amount =
      penalty.kind === "fixed"
        ? multiplyKurus(kurus(roundHalfUp(penalty.amount)), -penalty.quantity)
        : multiplyKurus(
            percentOf(kurus(laborNet), penalty.amount),
            -penalty.quantity
          )
    push({
      kind: "penalty",
      keyParts: [penalty.code, index],
      label: penalty.note
        ? `${penalty.label} (${penalty.note})`
        : penalty.label,
      locationId: null,
      locationName: null,
      position: null,
      versionNumber: null,
      from: null,
      to: null,
      quantity: penalty.quantity,
      unit: "adet",
      unitPrice:
        penalty.kind === "fixed" ? kurus(roundHalfUp(penalty.amount)) : null,
      amount,
    })
  })

  const sum = (...kinds: LineKind[]) =>
    addKurus(
      ...lines.filter((line) => kinds.includes(line.kind)).map((l) => l.amount)
    )
  const subtotal = addKurus(...lines.map((line) => line.amount))
  const lastVersion = segments.at(-1)?.version
  const vatRate = lastVersion?.rules.vatRate ?? 20
  const vat = percentOf(subtotal, vatRate)
  return {
    lines,
    totals: {
      labor: sum("labor"),
      deductions: sum("shortfall", "shortfall_penalty"),
      overtime: sum("overtime"),
      material: sum("material"),
      priceAdjustment: sum("price_adjustment"),
      penalties: sum("penalty"),
      subtotal,
      vatRate,
      vat,
      total: addKurus(subtotal, vat),
    },
    stats: {
      committedPersonDays: round2(stats.committedPersonDays),
      workedPersonDays: round2(stats.workedPersonDays),
      shortfallPersonDays: round2(stats.shortfallPersonDays),
      excessPersonDays: round2(stats.excessPersonDays),
      overtimeHours: round2(stats.overtimeHours),
    },
  }
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(
    value
  )
}

/**
 * Kaynak puantajın parmak izi (FNV-1a). Taslakta saklanır; güncel puantajın izi farklıysa
 * hakediş "güncel değil" sayılır.
 */
export function sourceFingerprint(worked: readonly WorkedEntry[]): string {
  const text = worked
    .map(
      (entry) =>
        `${entry.locationId}|${entry.position}|${entry.date}|${entry.personDays}|${entry.overtimeHours}`
    )
    .sort()
    .join(";")
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

/** İki hesap arasındaki satır farkları (yeniden hesaplama önizlemesi) */
export function diffCalculations(current: Calculation, next: Calculation) {
  const before = new Map(current.lines.map((line) => [line.key, line]))
  const after = new Map(next.lines.map((line) => [line.key, line]))
  const changes: {
    key: string
    label: string
    before: Kurus | null
    after: Kurus | null
    difference: Kurus
  }[] = []
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key)
    const b = after.get(key)
    if (a?.amount === b?.amount) continue
    changes.push({
      key,
      label: b?.label ?? a?.label ?? key,
      before: a?.amount ?? null,
      after: b?.amount ?? null,
      difference: kurus((b?.amount ?? 0) - (a?.amount ?? 0)),
    })
  }
  if (current.totals.total !== next.totals.total) {
    changes.push({
      key: "total",
      label: "Genel toplam (KDV dahil)",
      before: current.totals.total,
      after: next.totals.total,
      difference: kurus(next.totals.total - current.totals.total),
    })
  }
  return changes
}
