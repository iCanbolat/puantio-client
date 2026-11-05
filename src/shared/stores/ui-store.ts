import { create } from "zustand"
import { persist } from "zustand/middleware"

import { storageKey } from "@/shared/config/brand"

import { readStorageItem, safeJsonStorage } from "./safe-storage"

/** Kullanıcıya özel, kişisel veri içermeyen arayüz tercihleri. */
interface UiState {
  sidebarOpen: boolean
  /** Tablo kimliği → görünmez kolonlar */
  hiddenColumns: Record<string, string[]>
  alarmSoundEnabled: boolean
  setSidebarOpen: (open: boolean) => void
  setHiddenColumns: (tableId: string, columns: string[]) => void
  setAlarmSoundEnabled: (enabled: boolean) => void
}

const DEFAULTS = {
  sidebarOpen: true,
  hiddenColumns: {},
  alarmSoundEnabled: true,
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSidebarOpen: (sidebarOpen) => {
        set({ sidebarOpen })
      },
      setHiddenColumns: (tableId, columns) => {
        set((state) => ({
          hiddenColumns: { ...state.hiddenColumns, [tableId]: columns },
        }))
      },
      setAlarmSoundEnabled: (alarmSoundEnabled) => {
        set({ alarmSoundEnabled })
      },
    }),
    {
      name: storageKey("ui"),
      version: 1,
      storage: safeJsonStorage,
      // Kiracı belli olmadan okunmaz: `scopeUiStoreToTenant` kiracı anahtarından yükler
      skipHydration: true,
    }
  )
)

/**
 * Tercihleri kiracı kapsamlı anahtara (`puantio.<kiracı>.ui`) bağlar. Aynı tarayıcıda iki
 * firmaya giren kullanıcının kolon/menü tercihleri karışmaz.
 */
export function scopeUiStoreToTenant(tenantSlug: string): void {
  const name = storageKey("ui", tenantSlug)
  if (useUiStore.persist.getOptions().name === name) return
  useUiStore.persist.setOptions({ name })
  if (readStorageItem(name) === null) {
    useUiStore.setState(DEFAULTS)
  } else {
    void useUiStore.persist.rehydrate()
  }
}

/** Testler: varsayılan tercihler ve kapsamsız anahtar. */
export function resetUiStore(): void {
  useUiStore.persist.setOptions({ name: storageKey("ui") })
  useUiStore.setState(DEFAULTS)
}
