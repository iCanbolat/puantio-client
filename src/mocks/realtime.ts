import { ws } from "msw"

import { mockClock } from "./clock"

/**
 * Gerçek zamanlı kanal mock'u. İstemci `.../api/realtime` adresine bağlanır.
 * Faz 2+ olayları (`attendance.checked_in`, `alarm.created` ...) `broadcastEvent` ile yayınlanır.
 */
export const realtimeLink = ws.link(/\/api\/realtime$/)

function envelope(type: string, payload: unknown): string {
  return JSON.stringify({
    type,
    occurredAt: mockClock.now().toISOString(),
    payload,
  })
}

export function broadcastEvent(type: string, payload: unknown): void {
  realtimeLink.broadcast(envelope(type, payload))
}

/** Mock saat değişince bağlı istemcilerin sunucu saatini güncelle. */
export function broadcastServerTime(): void {
  broadcastEvent("system.hello", { serverTime: mockClock.now().toISOString() })
}

export const realtimeHandlers = [
  realtimeLink.addEventListener("connection", ({ client }) => {
    client.send(
      envelope("system.hello", { serverTime: mockClock.now().toISOString() })
    )
  }),
]
