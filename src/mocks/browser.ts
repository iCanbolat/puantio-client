import { setupWorker } from "msw/browser"

import type { AppContextOptions } from "@/app/app-context"
import { storageKey } from "@/shared/config/brand"
import { syncServerTime } from "@/shared/lib/server-time"
import { safeSession } from "@/shared/stores/safe-storage"

import {
  defaultIdentity,
  identityFor,
  identityForEmail,
} from "./auth/identities"
import { createMockAuthAdapter } from "./auth/mock-auth-adapter"

import { getChaos, resetChaos, setChaos, type ChaosSettings } from "./chaos"
import { mockClock } from "./clock"
import type { SeedProfile } from "./db"
import {
  DEFAULT_MOCK_TENANT,
  useMockDevtoolsStore,
} from "./devtools/devtools-store"
import { handlers } from "./handlers"
import { restoreSupportSessions } from "./platform/persistence"
import { evaluateAlarms } from "./operations/attendance"
import { simulateCheckIn } from "./operations/attendance-handlers"
import { db } from "./db"
import {
  broadcastServerTime,
  isRealtimeBlocked,
  setRealtimeBlocked,
} from "./realtime"
import { DEFAULT_SCENARIO_ID, applyScenario, findScenario } from "./scenarios"

export const worker = setupWorker(...handlers)

const store = () => useMockDevtoolsStore.getState()

function publishClock() {
  const now = mockClock.now().toISOString()
  syncServerTime(now)
  broadcastServerTime()
  evaluateCurrentTenant()
}

/** Gerçek backend'deki alarm zamanlayıcısının mock karşılığı */
function evaluateCurrentTenant() {
  const tenant = db.tenants.findById(store().tenantSlug || DEFAULT_MOCK_TENANT)
  if (tenant?.kind === "tenant") evaluateAlarms(tenant)
}

/**
 * Dev panelinin çağırdığı kontroller. Her işlem hem mock çalışma zamanını günceller
 * hem de tercihi saklar (sayfa yenilemede geri yüklenir).
 */
export const mockController = {
  selectScenario(id: string) {
    const scenario = applyScenario(worker, id, store().seedProfile)
    store().set({ scenarioId: scenario.id })
  },
  selectSeedProfile(profile: SeedProfile) {
    applyScenario(worker, store().scenarioId, profile)
    store().set({ seedProfile: profile })
  },
  resetDatabase() {
    applyScenario(worker, store().scenarioId, store().seedProfile)
  },
  travelTo(at: Date) {
    mockClock.travelTo(at)
    store().set({ clockOffsetMs: mockClock.getOffsetMs() ?? 0 })
    publishClock()
  },
  advance(ms: number) {
    mockClock.advance(ms)
    store().set({ clockOffsetMs: mockClock.getOffsetMs() ?? 0 })
    publishClock()
  },
  resetClock() {
    mockClock.reset()
    store().set({ clockOffsetMs: 0 })
    publishClock()
  },
  updateChaos(patch: Partial<ChaosSettings>) {
    setChaos(patch)
    store().set({ chaos: getChaos() })
  },
  /** Kiracı değişince sayfa yeniden açılır (gerçekte farklı alt alan adı) */
  selectTenant(slug: string) {
    store().set({ tenantSlug: slug, mockUserKey: null, pendingSignIn: false })
    window.location.assign("/")
  },
  /** Seçilen kullanıcıyla yeniden oturum açar */
  signInAs(userKey: string) {
    store().set({ mockUserKey: userKey, pendingSignIn: true })
    window.location.reload()
  },
  /** Saha uygulamasından giriş: bekleyen ilk personel QR ile giriş yapar */
  simulateCheckIn(): string | null {
    return simulateCheckIn(store().tenantSlug || DEFAULT_MOCK_TENANT)
  },
  /** Canlı bağlantıyı kopar / aç; yeni durumu döner */
  toggleRealtime(): boolean {
    const next = !isRealtimeBlocked()
    setRealtimeBlocked(next)
    return next
  },
  resetAll() {
    mockClock.reset()
    resetChaos()
    store().reset()
    applyScenario(worker, DEFAULT_SCENARIO_ID, store().seedProfile)
    publishClock()
  },
}

/**
 * E2E ve demo linkleri için URL ile senaryo seçimi:
 * `?senaryo=server-error&saat=2026-09-29T07:10:00%2B03:00&veri=test`
 * Parametreler okunduktan sonra URL'den temizlenir.
 */
function readUrlOverrides() {
  const url = new URL(window.location.href)
  const scenario = url.searchParams.get("senaryo")
  const clock = url.searchParams.get("saat")
  const profile = url.searchParams.get("veri")
  const tenant = url.searchParams.get("kiraci")
  const user = url.searchParams.get("kullanici")
  if (!scenario && !clock && !profile && !tenant && !user) return

  if (tenant) store().set({ tenantSlug: tenant })
  if (user) store().set({ mockUserKey: user, pendingSignIn: true })

  if (scenario && findScenario(scenario)) store().set({ scenarioId: scenario })
  if (profile === "test" || profile === "dev" || profile === "scale") {
    store().set({ seedProfile: profile })
  }
  if (clock && !Number.isNaN(Date.parse(clock))) {
    store().set({ clockOffsetMs: Date.parse(clock) - Date.now() })
  }
  for (const key of ["senaryo", "saat", "veri", "kiraci", "kullanici"])
    url.searchParams.delete(key)
  window.history.replaceState(window.history.state, "", url)
}

/**
 * Uygulamaya mock kiracıyı ve yönlendirmesiz kimlik adaptörünü verir. `?kullanici=` ile
 * gelindiyse mevcut oturum silinir ve seçilen kullanıcıyla doğrudan oturum açılır.
 */
export function mockAppOptions(): Required<AppContextOptions> {
  const state = store()
  const tenantSlug = state.tenantSlug || DEFAULT_MOCK_TENANT
  const initialKey = state.pendingSignIn ? state.mockUserKey : null
  if (state.pendingSignIn) {
    safeSession.remove(storageKey("mock-auth", tenantSlug))
    store().set({ pendingSignIn: false })
  }
  return {
    tenantSlug,
    authFactory: (tenant) =>
      createMockAuthAdapter(tenant, {
        initialIdentity: initialKey
          ? identityFor(tenant.slug, initialKey)
          : null,
        resolveIdentity: ({ loginHint }) => {
          const selected = store().mockUserKey
          if (selected) return identityFor(tenant.slug, selected)
          return identityForEmail(loginHint) ?? defaultIdentity(tenant.slug)
        },
      }),
  }
}

export async function startMocking(): Promise<void> {
  readUrlOverrides()
  const state = store()
  if (state.clockOffsetMs !== 0)
    mockClock.travelTo(new Date(Date.now() + state.clockOffsetMs))
  setChaos(state.chaos)
  const scenarioId = findScenario(state.scenarioId)
    ? state.scenarioId
    : DEFAULT_SCENARIO_ID
  applyScenario(worker, scenarioId, state.seedProfile)
  restoreSupportSessions()
  syncServerTime(mockClock.now().toISOString())

  setInterval(evaluateCurrentTenant, 10_000)

  await worker.start({
    quiet: true,
    onUnhandledRequest(request, print) {
      const { pathname } = new URL(request.url)
      if (pathname.startsWith("/api/")) print.warning()
    },
  })
}
