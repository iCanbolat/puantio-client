import { createJSONStorage, type StateStorage } from "zustand/middleware"

/**
 * localStorage erişimi gizli sekmede, kapatılmış site verisinde veya kota dolduğunda
 * hata fırlatabilir. Bu sarmalayıcı hataları yutar; uygulama tercihsiz çalışmaya devam eder.
 *
 * KVKK: Bu depolamaya yalnızca kişisel veri içermeyen UI tercihleri yazılır.
 */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // yok say
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // yok say
    }
  },
}

export const safeJsonStorage = createJSONStorage(() => safeLocalStorage)

export function readStorageItem(name: string): string | null {
  const value = safeLocalStorage.getItem(name)
  return typeof value === "string" ? value : null
}

/** sessionStorage erişimi (oturum verisi). Hatalar yutulur. */
export const safeSession = {
  get(name: string): string | null {
    try {
      return sessionStorage.getItem(name)
    } catch {
      return null
    }
  },
  set(name: string, value: string): void {
    try {
      sessionStorage.setItem(name, value)
    } catch {
      // yok say
    }
  },
  remove(name: string): void {
    try {
      sessionStorage.removeItem(name)
    } catch {
      // yok say
    }
  },
}
