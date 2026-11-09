import { use, useEffect, type ReactNode } from "react"

import { syncServerTime } from "@/shared/lib/server-time"

import { systemHelloEvent, type RealtimeClient } from "./realtime"
import { RealtimeContext } from "./realtime-context"

/**
 * Realtime istemcisini bağlama verir. Bağlantıyı `RealtimeConnection` açar: yalnızca
 * oturumlu kabuklar (kiracı kökü) bağlanır; login'siz QR sayfası WebSocket açmaz.
 */
export function RealtimeProvider({
  client,
  children,
}: {
  client: RealtimeClient
  children: ReactNode
}) {
  return <RealtimeContext value={client}>{children}</RealtimeContext>
}

/** Mount olduğu sürece realtime bağlantısını açık tutar ve sunucu saatini eşitler. */
export function RealtimeConnection() {
  const client = use(RealtimeContext)
  useEffect(() => {
    if (!client) return
    const offHello = client.on(systemHelloEvent, ({ payload }) => {
      syncServerTime(payload.serverTime)
    })
    client.connect()
    return () => {
      offHello()
      client.disconnect()
    }
  }, [client])
  return null
}
