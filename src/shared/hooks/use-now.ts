import { useEffect, useState } from "react"

import { serverNow, subscribeServerTime } from "@/shared/lib/server-time"

/**
 * Sunucu saatine göre "şimdi". Geri sayım ve SLA göstergeleri bu hook'u kullanır;
 * tarayıcı saati yanlış olsa da doğru süre gösterilir.
 */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    const tick = () => {
      setNow(serverNow())
    }
    const timer = setInterval(tick, intervalMs)
    const unsubscribe = subscribeServerTime(tick)
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [intervalMs])

  return now
}
