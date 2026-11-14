import { useEffect, useState } from "react"

import type { RevealResponse } from "../model/health"

/** Açılan veri bu süre sonunda yeniden maskelenir */
export const REVEAL_TTL_MS = 5 * 60_000

/**
 * Açılmış sağlık verisi yalnızca bileşen durumunda tutulur: sorgu önbelleğine, URL'ye ve
 * tarayıcı deposuna yazılmaz; 5 dk sonra veya bileşen kapanınca silinir.
 */
export function useRevealedRecord() {
  const [revealed, setRevealed] = useState<RevealResponse | null>(null)
  useEffect(() => {
    if (!revealed) return
    const timer = window.setTimeout(() => {
      setRevealed(null)
    }, REVEAL_TTL_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [revealed])
  return [revealed, setRevealed] as const
}
