import { useEffect, useState } from "react"

import { useIdleTimeout } from "@/shared/hooks/use-idle-timeout"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"

/**
 * KVKK: ortak bilgisayarda açık kalan oturum kapanır. `timeoutMs` boyunca etkileşim
 * olmazsa önce uyarı gösterilir, `warningMs` içinde yanıt gelmezse `onTimeout` çağrılır.
 */
export function IdleSessionGuard({
  timeoutMs,
  warningMs = 60_000,
  onTimeout,
}: {
  timeoutMs: number
  warningMs?: number
  onTimeout: () => void
}) {
  const [warning, setWarning] = useState(false)
  const [remaining, setRemaining] = useState(Math.round(warningMs / 1000))

  useIdleTimeout({
    timeoutMs: Math.max(1000, timeoutMs - warningMs),
    enabled: !warning,
    onIdle: () => {
      setRemaining(Math.round(warningMs / 1000))
      setWarning(true)
    },
  })

  useEffect(() => {
    if (!warning) return
    const deadline = Date.now() + warningMs
    const tick = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    }, 1000)
    const timer = setTimeout(() => {
      setWarning(false)
      onTimeout()
    }, warningMs)
    return () => {
      clearInterval(tick)
      clearTimeout(timer)
    }
  }, [warning, warningMs, onTimeout])

  return (
    <AlertDialog open={warning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Oturumunuz kapanmak üzere</AlertDialogTitle>
          <AlertDialogDescription>
            Uzun süredir işlem yapmadınız. Güvenliğiniz için oturumunuz{" "}
            <span className="font-semibold tabular-nums">{remaining} sn</span>{" "}
            içinde kapatılacak.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setWarning(false)
              onTimeout()
            }}
          >
            Çıkış yap
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setWarning(false)
            }}
          >
            Oturumu sürdür
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
