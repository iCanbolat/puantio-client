import { POSITION_LABELS } from "@/entities/personnel"
import { kurus } from "@/shared/lib/money"

import { validateCommitments } from "../domain/commitments"
import {
  contractRulesSchema,
  versionBodySchema,
  type ContractRules,
  type VersionBody,
} from "../model/contract"
import type { ErrorMap } from "../components/body-editors"

export type BodySection =
  "scope" | "locations" | "commitments" | "prices" | "rules"

const SECTION_KEYS: Record<BodySection, readonly string[]> = {
  scope: ["serviceLines", "scopeItems"],
  locations: ["locations"],
  commitments: ["commitments"],
  prices: ["prices"],
  rules: ["rules"],
}

export const DEFAULT_RULES: ContractRules = {
  shortfallDeductionPercent: 100,
  shortfallPenaltyPerPersonDay: kurus(0),
  vatRate: 20,
  priceAdjustment: {
    kind: "none",
    laborSharePercent: 100,
    ratePercent: null,
    effectiveFrom: null,
  },
  penalties: [],
}

export function emptyBody(rules: ContractRules = DEFAULT_RULES): VersionBody {
  return {
    serviceLines: [],
    scopeItems: [],
    locations: [],
    commitments: [],
    prices: {
      unitPrices: [],
      overtimeHourly: kurus(0),
      materialMonthly: kurus(0),
    },
    rules: structuredClone(rules),
  }
}

/** Fiyat listesini taahhütteki pozisyonlarla hizalar (kullanılmayan pozisyon fiyatı atılır) */
export function normalizeBody(body: VersionBody): VersionBody {
  const positions = new Set(body.commitments.map((item) => item.position))
  return {
    ...body,
    prices: {
      ...body.prices,
      unitPrices: body.prices.unitPrices.filter((item) =>
        positions.has(item.position)
      ),
    },
  }
}

/** Gövdenin istemci doğrulaması; `sections` verilirse yalnızca o bölümlerin hataları */
export function bodyErrors(
  raw: VersionBody,
  sections?: readonly BodySection[]
): ErrorMap {
  const body = normalizeBody(raw)
  const errors: Record<string, string> = {}
  const result = versionBodySchema.safeParse(body)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join(".")
      errors[key] ??= issue.message
    }
  }
  const check = validateCommitments(body.commitments, body.locations)
  for (const issue of check.issues)
    errors[`commitments.${issue.index}.locationId`] ??= issue.message
  if (check.uncoveredLocations.length > 0 && !("commitments" in errors))
    errors.commitments = `Taahhüt girilmemiş lokasyon: ${check.uncoveredLocations.join(", ")}`
  const priced = new Set(
    body.prices.unitPrices
      .filter((item) => item.monthly > 0)
      .map((item) => item.position)
  )
  const missing = [...new Set(body.commitments.map((item) => item.position))]
    .filter((position) => !priced.has(position))
    .map((position) => POSITION_LABELS[position])
  if (missing.length > 0)
    errors["prices.unitPrices"] = `Birim fiyat girin: ${missing.join(", ")}`
  if (!sections) return errors
  const keys = sections.flatMap((section) => SECTION_KEYS[section])
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) =>
      keys.some((prefix) => key === prefix || key.startsWith(`${prefix}.`))
    )
  )
}

export function rulesErrors(rules: ContractRules): ErrorMap {
  const result = contractRulesSchema.safeParse(rules)
  if (result.success) return {}
  return Object.fromEntries(
    result.error.issues.map((issue) => [
      `rules.${issue.path.join(".")}`,
      issue.message,
    ])
  )
}

/** Sunucu 422 alan hatalarını (`body.x.y`) gövde hata haritasına çevirir */
export function serverBodyErrors(
  fieldErrors: Readonly<Record<string, string[]>> | undefined
): ErrorMap {
  if (!fieldErrors) return {}
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .filter(([key]) => key.startsWith("body."))
      .map(([key, messages]) => [key.slice(5), messages[0] ?? "Geçersiz"])
  )
}

export function sectionOf(key: string): BodySection | null {
  for (const [section, keys] of Object.entries(SECTION_KEYS) as [
    BodySection,
    readonly string[],
  ][]) {
    if (keys.some((prefix) => key === prefix || key.startsWith(`${prefix}.`)))
      return section
  }
  return null
}
