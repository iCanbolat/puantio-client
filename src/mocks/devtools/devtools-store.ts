import { create } from "zustand"
import { persist } from "zustand/middleware"

import { storageKey } from "@/shared/config/brand"
import { safeJsonStorage } from "@/shared/stores/safe-storage"

import { DEFAULT_CHAOS, type ChaosSettings } from "../chaos"
import type { SeedProfile } from "../db"
import { DEFAULT_SCENARIO_ID } from "../scenarios"

/** Dev paneli tercihleri. Sayfa yenilendiğinde senaryo, saat ve kaos ayarları geri yüklenir. */
interface MockDevtoolsState {
  scenarioId: string
  seedProfile: SeedProfile
  /** Gerçek saate göre fark (ms). 0 = gerçek saat. */
  clockOffsetMs: number
  chaos: ChaosSettings
  /** Mock modunda açılan kiracı (gerçekte alt alan adından çözülür) */
  tenantSlug: string
  /** Giriş butonuna basıldığında açılacak kullanıcı anahtarı ("admin", "bolge", "destek"...) */
  mockUserKey: string | null
  /** Bir sonraki açılışta seçili kullanıcıyla doğrudan oturum aç (`?kullanici=`) */
  pendingSignIn: boolean
  set: (patch: Partial<Omit<MockDevtoolsState, "set" | "reset">>) => void
  reset: () => void
}

export const DEFAULT_MOCK_TENANT = "temizlik-orta"

const initial = {
  scenarioId: DEFAULT_SCENARIO_ID,
  seedProfile: "dev" as SeedProfile,
  clockOffsetMs: 0,
  chaos: DEFAULT_CHAOS,
  tenantSlug: DEFAULT_MOCK_TENANT,
  mockUserKey: null,
  pendingSignIn: false,
}

export const useMockDevtoolsStore = create<MockDevtoolsState>()(
  persist(
    (set) => ({
      ...initial,
      set: (patch) => {
        set(patch)
      },
      reset: () => {
        set(initial)
      },
    }),
    { name: storageKey("mock-devtools"), version: 2, storage: safeJsonStorage }
  )
)
