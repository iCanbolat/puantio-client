import { useEffect, useRef } from "react"

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
] as const

/**
 * Kullanıcı `timeoutMs` boyunca etkileşimde bulunmazsa `onIdle` çağrılır.
 * KVKK: ortak bilgisayarlarda açık kalan oturumların kapatılması için kullanılır.
 */
export function useIdleTimeout(options: {
  timeoutMs: number
  onIdle: () => void
  enabled?: boolean
}): void {
  const { timeoutMs, enabled = true } = options
  const onIdleRef = useRef(options.onIdle)

  useEffect(() => {
    onIdleRef.current = options.onIdle
  })

  useEffect(() => {
    if (!enabled) return
    let timer = setTimeout(() => {
      onIdleRef.current()
    }, timeoutMs)
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        onIdleRef.current()
      }, timeoutMs)
    }
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset, { passive: true })
    }
    return () => {
      clearTimeout(timer)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset)
      }
    }
  }, [timeoutMs, enabled])
}
