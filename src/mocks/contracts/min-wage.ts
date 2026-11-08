/**
 * Brüt asgari ücret tablosu (kuruş). **Mock değerlerdir**; gerçek tablo backend'in
 * referans verisinden (`GET /reference/min-wage`) gelir.
 */
export const MIN_WAGES = [
  { effectiveFrom: "2025-01-01", grossMonthly: 2_600_225 },
  { effectiveFrom: "2026-01-01", grossMonthly: 3_300_000 },
  { effectiveFrom: "2026-07-01", grossMonthly: 3_564_000 },
] as const
