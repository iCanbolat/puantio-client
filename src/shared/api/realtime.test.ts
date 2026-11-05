import { waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { mockClock } from "@/mocks/clock"
import { broadcastEvent, realtimeLink } from "@/mocks/realtime"
import { server } from "@/mocks/server"

import {
  createRealtimeClient,
  defineRealtimeEvent,
  resolveRealtimeUrl,
  systemHelloEvent,
  type RealtimeClient,
} from "./realtime"

const alarmEvent = defineRealtimeEvent(
  "alarm.created",
  z.object({ alarmId: z.string(), locationName: z.string() })
)

let client: RealtimeClient | null = null

function connect(options: { baseDelayMs?: number } = {}) {
  const logger = { warn: vi.fn() }
  client = createRealtimeClient({
    url: resolveRealtimeUrl("http://localhost/api"),
    logger,
    baseDelayMs: options.baseDelayMs ?? 10,
  })
  return { client, logger }
}

afterEach(() => {
  client?.disconnect()
  client = null
})

describe("realtime istemcisi", () => {
  it("TC-0.3-16 bağlanır ve sistem selamını (sunucu saati) alır", async () => {
    mockClock.freeze("2026-09-29T07:10:00+03:00")
    const { client } = connect()
    const hello = vi.fn()
    client.on(systemHelloEvent, hello)
    client.connect()

    await waitFor(() => {
      expect(client.getStatus()).toBe("open")
    })
    await waitFor(() => {
      expect(hello).toHaveBeenCalledWith({
        payload: { serverTime: "2026-09-29T04:10:00.000Z" },
        occurredAt: "2026-09-29T04:10:00.000Z",
      })
    })
  })

  it("TC-0.3-17 tipli olayları iletir, şemaya uymayanları yok sayar", async () => {
    const { client, logger } = connect()
    const handler = vi.fn()
    const off = client.on(alarmEvent, handler)
    client.connect()
    await waitFor(() => {
      expect(client.getStatus()).toBe("open")
    })

    broadcastEvent("alarm.created", {
      alarmId: "a1",
      locationName: "Kadıköy Şubesi",
    })
    broadcastEvent("alarm.created", { alarmId: 42 })
    realtimeLink.broadcast("json değil")

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1)
    })
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      payload: { alarmId: "a1", locationName: "Kadıköy Şubesi" },
    })
    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledTimes(2)
    })

    off()
    broadcastEvent("alarm.created", { alarmId: "a2", locationName: "Ulus" })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("TC-0.3-18 bağlantı koparsa yeniden bağlanır", async () => {
    let connections = 0
    server.use(
      realtimeLink.addEventListener("connection", ({ client: socket }) => {
        connections += 1
        if (connections === 1) setTimeout(() => socket.close(), 5)
      })
    )
    const { client } = connect()
    const statuses: string[] = []
    client.onStatusChange((status) => statuses.push(status))
    client.connect()

    await waitFor(() => {
      expect(connections).toBe(2)
    })
    await waitFor(() => {
      expect(client.getStatus()).toBe("open")
    })
    expect(statuses).toEqual(["connecting", "open", "reconnecting", "open"])
  })

  it("disconnect sonrası yeniden bağlanmaz", async () => {
    const { client } = connect()
    client.connect()
    await waitFor(() => {
      expect(client.getStatus()).toBe("open")
    })
    client.disconnect()
    expect(client.getStatus()).toBe("closed")
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(client.getStatus()).toBe("closed")
  })

  it("WebSocket adresi API adresinden türetilir", () => {
    expect(resolveRealtimeUrl("/api")).toBe("ws://localhost:3000/api/realtime")
    expect(resolveRealtimeUrl("https://api.puantio.com/v1/")).toBe(
      "wss://api.puantio.com/v1/realtime"
    )
    expect(resolveRealtimeUrl("/api", "wss://rt.example/ws")).toBe(
      "wss://rt.example/ws"
    )
  })
})
