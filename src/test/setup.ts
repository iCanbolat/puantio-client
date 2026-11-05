import "@testing-library/jest-dom/vitest"

import { cleanup, configure } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"

import { resetChaos } from "@/mocks/chaos"
import { mockClock } from "@/mocks/clock"
import { resetDatabase } from "@/mocks/db"
import { server } from "@/mocks/server"
import { resetHttpConfig } from "@/shared/api/http"
import { resetServerTime } from "@/shared/lib/server-time"
import { resetUiStore } from "@/shared/stores/ui-store"

// Tam route render eden entegrasyon testleri (lazy chunk + MSW) kapsam ölçümü ve paralel
// çalışma altında 1 sn'yi aşabilir.
configure({ asyncUtilTimeout: 5000 })

// --- jsdom eksikleri -------------------------------------------------------
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

class ResizeObserverStub {
  observe() {
    return undefined
  }
  unobserve() {
    return undefined
  }
  disconnect() {
    return undefined
  }
}
const globals = globalThis as Partial<typeof globalThis>
if (typeof globals.ResizeObserver !== "function") {
  globals.ResizeObserver = ResizeObserverStub
}

const elementProto = Element.prototype as Partial<Element>
if (typeof elementProto.scrollIntoView !== "function") {
  elementProto.scrollIntoView = () => undefined
}
if (typeof elementProto.hasPointerCapture !== "function") {
  elementProto.hasPointerCapture = () => false
}
if (typeof elementProto.releasePointerCapture !== "function") {
  elementProto.releasePointerCapture = () => undefined
}
if (typeof elementProto.setPointerCapture !== "function") {
  elementProto.setPointerCapture = () => undefined
}

// --- MSW ve durum sıfırlama -------------------------------------------------
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
})

beforeEach(() => {
  resetDatabase("test")
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  server.resetHandlers()
  mockClock.reset()
  resetChaos()
  resetServerTime()
  resetHttpConfig()
  resetUiStore()
  localStorage.clear()
  sessionStorage.clear()
})

afterAll(() => {
  server.close()
})
