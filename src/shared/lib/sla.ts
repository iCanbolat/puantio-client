export type SlaState = "ok" | "warning" | "breached"

/** Kalan süreye göre SLA durumu: süre bittiyse "breached", eşik altındaysa "warning". */
export function getSlaState(
  remainingMs: number,
  warnBelowMs: number
): SlaState {
  if (remainingMs < 0) return "breached"
  if (remainingMs <= warnBelowMs) return "warning"
  return "ok"
}
