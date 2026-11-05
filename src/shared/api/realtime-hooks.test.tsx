import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { broadcastEvent } from "@/mocks/realtime"
import { getServerTimeOffset } from "@/shared/lib/server-time"
import { mockClock } from "@/mocks/clock"

import {
  createRealtimeClient,
  defineRealtimeEvent,
  type RealtimeClient,
} from "./realtime"
import {
  usePollingFallback,
  useRealtimeEvent,
  useRealtimeStatus,
} from "./realtime-hooks"
import { RealtimeProvider } from "./realtime-react"

const checkInEvent = defineRealtimeEvent(
  "attendance.checked_in",
  z.object({ personnelId: z.string() })
)

let client: RealtimeClient

function wrapper({ children }: { children: ReactNode }) {
  return <RealtimeProvider client={client}>{children}</RealtimeProvider>
}

afterEach(() => {
  client.disconnect()
})

describe("realtime hook'ları", () => {
  it("TC-0.3-19 bağlantı yokken polling devrede, bağlanınca kapanır", async () => {
    client = createRealtimeClient({
      url: "ws://localhost/api/realtime",
      logger: { warn: vi.fn() },
    })
    const { result } = renderHook(
      () => ({
        status: useRealtimeStatus(),
        interval: usePollingFallback(30_000),
      }),
      { wrapper }
    )
    expect(result.current.interval).toBe(30_000)
    await waitFor(() => {
      expect(result.current.status).toBe("open")
    })
    expect(result.current.interval).toBe(false)
  })

  it("olay aboneliği en güncel handler'ı çağırır; selam sunucu saatini senkronlar", async () => {
    mockClock.freeze(new Date(Date.now() + 2 * 3_600_000))
    client = createRealtimeClient({
      url: "ws://localhost/api/realtime",
      logger: { warn: vi.fn() },
    })
    const calls: string[] = []
    const { rerender } = renderHook(
      ({ label }: { label: string }) => {
        useRealtimeEvent(checkInEvent, ({ payload }) => {
          calls.push(`${label}:${payload.personnelId}`)
        })
        return useRealtimeStatus()
      },
      { wrapper, initialProps: { label: "ilk" } }
    )
    await waitFor(() => {
      expect(client.getStatus()).toBe("open")
    })
    await waitFor(() => {
      expect(Math.abs(getServerTimeOffset() - 2 * 3_600_000)).toBeLessThan(2000)
    })
    rerender({ label: "yeni" })
    act(() => {
      broadcastEvent("attendance.checked_in", { personnelId: "P-7" })
    })
    await waitFor(() => {
      expect(calls).toEqual(["yeni:P-7"])
    })
  })

  it("provider dışında kullanım açık hata verir", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(() => renderHook(() => useRealtimeStatus())).toThrow(
      /RealtimeProvider içinde/
    )
  })
})
