import { useEffect, type ReactNode } from "react"

import { syncServerTime } from "@/shared/lib/server-time"

import { systemHelloEvent, type RealtimeClient } from "./realtime"
import { RealtimeContext } from "./realtime-context"

export function RealtimeProvider({
  client,
  children,
}: {
  client: RealtimeClient
  children: ReactNode
}) {
  useEffect(() => {
    const offHello = client.on(systemHelloEvent, ({ payload }) => {
      syncServerTime(payload.serverTime)
    })
    client.connect()
    return () => {
      offHello()
      client.disconnect()
    }
  }, [client])

  return <RealtimeContext value={client}>{children}</RealtimeContext>
}
