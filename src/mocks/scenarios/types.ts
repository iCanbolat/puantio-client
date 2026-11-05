import type { RequestHandler, WebSocketHandler } from "msw"

export interface ScenarioDefinition {
  id: string
  label: string
  description: string
  /** Senaryonun ait olduğu faz (dev panelinde gruplama için) */
  phase: number
  /** DB seed'inden sonra veriyi senaryoya göre düzenler */
  setup?: () => void
  /** Varsayılan handler'ların önüne eklenen override'lar */
  handlers?: () => (RequestHandler | WebSocketHandler)[]
}

export function defineScenario(
  definition: ScenarioDefinition
): ScenarioDefinition {
  return definition
}
