import { delay, http } from "msw"

import { apiPath, problem } from "./http"

/**
 * Ağ kaosu: tüm API isteklerine gecikme, rastgele hata veya belirli endpoint'e hata enjekte eder.
 * Handler zincirinin en başındadır; hata üretmezse isteği sonraki handler'a bırakır.
 */
export const HTTP_METHODS = [
  "*",
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const
export type FaultMethod = (typeof HTTP_METHODS)[number]

export interface EndpointFault {
  id: string
  method: FaultMethod
  /** URL yolunda geçen metin, ör. "/showcase/records" */
  pathContains: string
  status: number
}

export interface ChaosSettings {
  latencyMs: number
  /** 0–1 arası rastgele hata oranı */
  errorRate: number
  faults: EndpointFault[]
}

export const DEFAULT_CHAOS: ChaosSettings = {
  latencyMs: 0,
  errorRate: 0,
  faults: [],
}

let settings: ChaosSettings = { ...DEFAULT_CHAOS }

export function setChaos(next: Partial<ChaosSettings>): void {
  settings = { ...settings, ...next }
}

export function getChaos(): ChaosSettings {
  return settings
}

export function resetChaos(): void {
  settings = { ...DEFAULT_CHAOS, faults: [] }
}

/** Sistem uçları (saat, sağlık) kaostan etkilenmez: dev paneli her koşulda çalışsın. */
const isExempt = (pathname: string) =>
  pathname.includes("/system/") ||
  pathname.includes("/public/") ||
  pathname.endsWith("/api/me")

export const chaosHandler = http.all(apiPath("/*"), async ({ request }) => {
  const { pathname } = new URL(request.url)
  if (isExempt(pathname)) return undefined

  if (settings.latencyMs > 0) await delay(settings.latencyMs)

  const fault = settings.faults.find(
    (candidate) =>
      (candidate.method === "*" || candidate.method === request.method) &&
      pathname.includes(candidate.pathContains)
  )
  if (fault) {
    return problem(
      fault.status,
      "CHAOS_FAULT",
      `Enjekte edilen hata (${fault.status}).`
    )
  }
  if (settings.errorRate > 0 && Math.random() < settings.errorRate) {
    return problem(503, "CHAOS_RANDOM", "Rastgele hata (kaos modu).")
  }
  return undefined
})
