import { z } from "zod"

import { isoDateTimeSchema } from "@/shared/lib/date"

/**
 * Gerçek zamanlı kanal (WebSocket) soyutlaması.
 *
 * - Sunucu her mesajı `{ type, occurredAt, payload }` zarfıyla gönderir.
 * - Olay tipleri `defineRealtimeEvent` ile Zod şemasıyla tanımlanır; geçersiz payload
 *   uygulamayı çökertmez, yok sayılır ve konsola uyarı düşer.
 * - Bağlantı koparsa üstel geri çekilme ile yeniden bağlanır. Bağlantı açık değilken
 *   ekranlar `usePollingFallback` ile periyodik sorguya düşer.
 */
export const realtimeEnvelopeSchema = z.object({
  type: z.string().min(1),
  occurredAt: isoDateTimeSchema,
  payload: z.unknown(),
})
export type RealtimeEnvelope = z.infer<typeof realtimeEnvelopeSchema>

export interface RealtimeEventDefinition<TType extends string, TPayload> {
  type: TType
  schema: z.ZodType<TPayload>
}

export function defineRealtimeEvent<const TType extends string, TPayload>(
  type: TType,
  schema: z.ZodType<TPayload>
): RealtimeEventDefinition<TType, TPayload> {
  return { type, schema }
}

export interface RealtimeMessage<TPayload> {
  payload: TPayload
  occurredAt: string
}

export type RealtimeStatus =
  "idle" | "connecting" | "open" | "reconnecting" | "closed"

export interface RealtimeClient {
  connect: () => void
  disconnect: () => void
  getStatus: () => RealtimeStatus
  onStatusChange: (listener: (status: RealtimeStatus) => void) => () => void
  on: <TType extends string, TPayload>(
    event: RealtimeEventDefinition<TType, TPayload>,
    handler: (message: RealtimeMessage<TPayload>) => void
  ) => () => void
}

export interface RealtimeClientOptions {
  url: string
  WebSocketImpl?: typeof WebSocket
  baseDelayMs?: number
  maxDelayMs?: number
  logger?: Pick<Console, "warn">
}

type AnyHandler = (message: RealtimeMessage<unknown>) => void

export function createRealtimeClient(
  options: RealtimeClientOptions
): RealtimeClient {
  const {
    url,
    WebSocketImpl = globalThis.WebSocket,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    logger = console,
  } = options

  let socket: WebSocket | null = null
  let status: RealtimeStatus = "idle"
  let attempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let manuallyClosed = false

  const statusListeners = new Set<(status: RealtimeStatus) => void>()
  const handlers = new Map<
    string,
    Set<{ schema: z.ZodType; handler: AnyHandler }>
  >()

  const setStatus = (next: RealtimeStatus) => {
    if (status === next) return
    status = next
    statusListeners.forEach((listener) => listener(next))
  }

  const dispatch = (raw: unknown) => {
    if (typeof raw !== "string") return
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      logger.warn("[realtime] JSON olmayan mesaj yok sayıldı")
      return
    }
    const envelope = realtimeEnvelopeSchema.safeParse(json)
    if (!envelope.success) {
      logger.warn("[realtime] Geçersiz zarf yok sayıldı", envelope.error.issues)
      return
    }
    const subscribers = handlers.get(envelope.data.type)
    if (!subscribers) return
    for (const { schema, handler } of subscribers) {
      const payload = schema.safeParse(envelope.data.payload)
      if (!payload.success) {
        logger.warn(
          `[realtime] '${envelope.data.type}' payload şemaya uymuyor`,
          payload.error.issues
        )
        continue
      }
      handler({ payload: payload.data, occurredAt: envelope.data.occurredAt })
    }
  }

  const scheduleReconnect = () => {
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempts)
    attempts += 1
    setStatus("reconnecting")
    reconnectTimer = setTimeout(open, delay)
  }

  function open() {
    reconnectTimer = null
    manuallyClosed = false
    if (status !== "reconnecting") setStatus("connecting")
    const current = new WebSocketImpl(url)
    socket = current
    current.addEventListener("open", () => {
      attempts = 0
      setStatus("open")
    })
    current.addEventListener("message", (event: MessageEvent) => {
      dispatch(event.data)
    })
    current.addEventListener("close", () => {
      if (socket !== current) return
      socket = null
      if (manuallyClosed) {
        setStatus("closed")
      } else {
        scheduleReconnect()
      }
    })
  }

  return {
    connect() {
      if (socket || reconnectTimer) return
      open()
    },
    disconnect() {
      manuallyClosed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      const current = socket
      socket = null
      current?.close()
      attempts = 0
      setStatus("closed")
    },
    getStatus: () => status,
    onStatusChange(listener) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    on(event, handler) {
      const entry = {
        schema: event.schema as z.ZodType,
        handler: handler as AnyHandler,
      }
      let set = handlers.get(event.type)
      if (!set) {
        set = new Set()
        handlers.set(event.type, set)
      }
      set.add(entry)
      return () => {
        set.delete(entry)
      }
    },
  }
}

/** API adresinden WebSocket adresini türetir: "/api" → "ws://<host>/api/realtime". */
export function resolveRealtimeUrl(
  apiBaseUrl: string,
  explicitUrl?: string
): string {
  if (explicitUrl) return explicitUrl
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin
  const api = new URL(apiBaseUrl.replace(/\/+$/, "") + "/realtime", origin)
  api.protocol = api.protocol === "https:" ? "wss:" : "ws:"
  return api.toString()
}

/** Sistem olayları (her ortamda bulunur). */
export const systemHelloEvent = defineRealtimeEvent(
  "system.hello",
  z.object({ serverTime: isoDateTimeSchema })
)
