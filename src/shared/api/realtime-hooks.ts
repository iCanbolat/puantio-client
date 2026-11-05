import { use, useEffect, useRef, useSyncExternalStore } from "react"

import type {
  RealtimeClient,
  RealtimeEventDefinition,
  RealtimeMessage,
  RealtimeStatus,
} from "./realtime"
import { RealtimeContext } from "./realtime-context"

function useRealtimeClient(): RealtimeClient {
  const client = use(RealtimeContext)
  if (!client) {
    throw new Error(
      "useRealtime* hook'ları RealtimeProvider içinde kullanılmalı"
    )
  }
  return client
}

export function useRealtimeStatus(): RealtimeStatus {
  const client = useRealtimeClient()
  return useSyncExternalStore(
    client.onStatusChange,
    client.getStatus,
    client.getStatus
  )
}

/** Tipli olay aboneliği. Handler her render'da güncellenir, abonelik yenilenmez. */
export function useRealtimeEvent<TType extends string, TPayload>(
  event: RealtimeEventDefinition<TType, TPayload>,
  handler: (message: RealtimeMessage<TPayload>) => void
): void {
  const client = useRealtimeClient()
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  useEffect(
    () =>
      client.on(event, (message) => {
        handlerRef.current(message)
      }),
    [client, event]
  )
}

/**
 * Canlı bağlantı açık değilse sorgunun periyodik yenilenmesini sağlar.
 *
 * @example
 * const refetchInterval = usePollingFallback(30_000)
 * useQuery({ ...attendanceQueries.live(filters), refetchInterval })
 */
export function usePollingFallback(intervalMs: number): number | false {
  return useRealtimeStatus() === "open" ? false : intervalMs
}
