import type { RequestHandler, WebSocketHandler } from "msw"

import { resetDatabase, type SeedProfile } from "../db"
import { phase0Scenarios } from "./phase0"
import { phase2Scenarios } from "./phase2"
import { setRealtimeBlocked } from "../realtime"
import type { ScenarioDefinition } from "./types"

export { defineScenario, type ScenarioDefinition } from "./types"

/** Tüm senaryolar. Her faz kendi dosyasını ekler (phase1.ts, phase2.ts ...). */
export const scenarios: readonly ScenarioDefinition[] = [
  ...phase0Scenarios,
  ...phase2Scenarios,
]

export type ScenarioId = string

export const DEFAULT_SCENARIO_ID = "default"

export function findScenario(id: string): ScenarioDefinition | undefined {
  return scenarios.find((scenario) => scenario.id === id)
}

/** `worker` (tarayıcı) ve `server` (Node) ortak arayüzü */
export interface HandlerTarget {
  use: (...handlers: (RequestHandler | WebSocketHandler)[]) => void
  resetHandlers: () => void
}

/**
 * Senaryoyu uygular: handler override'larını temizler, DB'yi seed'ler, senaryo kurulumunu
 * ve handler'larını ekler.
 */
export function applyScenario(
  target: HandlerTarget,
  id: string,
  profile: SeedProfile
): ScenarioDefinition {
  const scenario = findScenario(id)
  if (!scenario) throw new Error(`Bilinmeyen senaryo: ${id}`)
  target.resetHandlers()
  setRealtimeBlocked(false)
  resetDatabase(profile)
  scenario.setup?.()
  const handlers = scenario.handlers?.() ?? []
  if (handlers.length > 0) target.use(...handlers)
  return scenario
}
