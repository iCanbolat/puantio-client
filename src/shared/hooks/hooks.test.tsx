import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useDebouncedValue } from "./use-debounced-value"
import { useIdleTimeout } from "./use-idle-timeout"
import { useMediaQuery } from "./use-media-query"
import { useIsMobile } from "./use-mobile"

afterEach(() => {
  vi.useRealTimers()
})

describe("genel hook'lar", () => {
  it("TC-1.1-05 (ön koşul) etkileşimsiz kalınca oturum kapatma tetiklenir", () => {
    vi.useFakeTimers()
    const onIdle = vi.fn()
    const { rerender, unmount } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        useIdleTimeout({ timeoutMs: 15 * 60_000, onIdle, enabled })
      },
      { initialProps: { enabled: true } }
    )
    act(() => {
      vi.advanceTimersByTime(14 * 60_000)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown"))
    })
    act(() => {
      vi.advanceTimersByTime(14 * 60_000)
    })
    expect(onIdle).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(onIdle).toHaveBeenCalledOnce()

    rerender({ enabled: false })
    act(() => {
      vi.advanceTimersByTime(60 * 60_000)
    })
    expect(onIdle).toHaveBeenCalledOnce()
    unmount()
  })

  it("gecikmeli değer", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      {
        initialProps: { value: "a" },
      }
    )
    rerender({ value: "ab" })
    rerender({ value: "abc" })
    expect(result.current).toBe("a")
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe("abc")
  })

  it("medya sorgusu değişiklikleri izler", () => {
    const listeners = new Set<() => void>()
    let matches = false
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          get matches() {
            return matches
          },
          media: query,
          addEventListener: (_: string, listener: () => void) =>
            listeners.add(listener),
          removeEventListener: (_: string, listener: () => void) =>
            listeners.delete(listener),
        }) as unknown as MediaQueryList
    )
    const { result } = renderHook(() => ({
      wide: useMediaQuery("(min-width: 768px)"),
      mobile: useIsMobile(),
    }))
    expect(result.current.wide).toBe(false)
    act(() => {
      matches = true
      listeners.forEach((listener) => listener())
    })
    expect(result.current.wide).toBe(true)
    expect(result.current.mobile).toBe(true)
  })
})
