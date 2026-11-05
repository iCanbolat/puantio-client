import type { SeedProfile } from "@/mocks/db"
import { applyScenario } from "@/mocks/scenarios"
import { server } from "@/mocks/server"

/**
 * Testte mock senaryosu uygular (DB yeniden seed'lenir, handler override'ları eklenir).
 * `afterEach` içinde handler'lar otomatik sıfırlanır.
 */
export function applyTestScenario(id: string, profile: SeedProfile = "test") {
  return applyScenario(server, id, profile)
}
