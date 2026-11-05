/**
 * Mock sunucu saati.
 *
 * MSW handler'ları `Date.now()` yerine `mockClock.now()` kullanır. Varsayılan olarak gerçek
 * saati izler; dev panelinden veya testlerden belirli bir ana sabitlenebilir ve ileri
 * sarılabilir. Her yanıt `x-server-time` başlığı taşıdığı için istemci UI'ı da bu saate
 * göre çalışır (bkz. `shared/lib/server-time.ts`).
 */
type ClockMode =
  | { kind: "real" }
  | { kind: "fixed"; at: number }
  | { kind: "offset"; ms: number }

let mode: ClockMode = { kind: "real" }
const listeners = new Set<() => void>()

const notify = () => {
  listeners.forEach((listener) => listener())
}

export const mockClock = {
  now(): Date {
    switch (mode.kind) {
      case "real":
        return new Date()
      case "fixed":
        return new Date(mode.at)
      case "offset":
        return new Date(Date.now() + mode.ms)
    }
  },

  /** Saati belirli bir ana sabitler (zaman akmaz). Testler için. */
  freeze(at: Date | string): void {
    mode = { kind: "fixed", at: new Date(at).getTime() }
    notify()
  },

  /** Saati belirli bir ana taşır ve oradan akmaya devam eder. Dev paneli için. */
  travelTo(at: Date | string): void {
    mode = { kind: "offset", ms: new Date(at).getTime() - Date.now() }
    notify()
  },

  /** Saati ileri (veya negatifle geri) sarar. */
  advance(ms: number): void {
    switch (mode.kind) {
      case "real":
        mode = { kind: "offset", ms }
        break
      case "fixed":
        mode = { kind: "fixed", at: mode.at + ms }
        break
      case "offset":
        mode = { kind: "offset", ms: mode.ms + ms }
        break
    }
    notify()
  },

  reset(): void {
    mode = { kind: "real" }
    notify()
  },

  isReal(): boolean {
    return mode.kind === "real"
  },

  /** Sayfa yenilemeden sonra geri yüklenebilmesi için offset (ms). Sabit modda `null`. */
  getOffsetMs(): number | null {
    if (mode.kind === "offset") return mode.ms
    if (mode.kind === "real") return 0
    return null
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
