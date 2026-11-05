import { useCallback, useEffect } from "react"
import { useNavigate } from "react-router"

import { useTenant } from "@/entities/tenant"
import { paths } from "@/shared/config/paths"

import { useSignOut } from "../lib/use-sign-out"
import { useAuth } from "./auth-context"
import { IdleSessionGuard } from "./idle-session-guard"

/**
 * Oturumlu kabukların (panel, platform) ortak oturum davranışları:
 * - Kiracı ayarındaki süre kadar etkileşim yoksa uyarı + çıkış
 * - Başka sekmede çıkış yapılınca bu sekme de giriş ekranına döner
 */
export function SessionEffects() {
  const tenant = useTenant()
  const auth = useAuth()
  const navigate = useNavigate()
  const signOut = useSignOut()

  useEffect(
    () =>
      auth.onRemoteLogout(() => {
        void navigate(paths.login({ reason: "cikis" }), { replace: true })
      }),
    [auth, navigate]
  )

  const onTimeout = useCallback(() => {
    void signOut("oturum-suresi")
  }, [signOut])

  return (
    <IdleSessionGuard
      timeoutMs={tenant.rules.idleTimeoutMinutes * 60_000}
      onTimeout={onTimeout}
    />
  )
}
