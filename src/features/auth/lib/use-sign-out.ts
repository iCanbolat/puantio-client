import { useCallback } from "react"
import { useNavigate } from "react-router"

import { paths, type LoginReason } from "@/shared/config/paths"

import { useAuth } from "../components/auth-context"

/**
 * Oturumu kapatır: diğer sekmelere bildirir, Keycloak oturumunu kapatır ve giriş sayfasına geçer.
 * Kullanıcı verisini giriş sayfası temizler (panel ekrandan kalktıktan sonra); burada temizlemek
 * açık paneli kapanmış oturumla `/me`'yi yeniden çekmeye zorlardı.
 */
export function useSignOut() {
  const auth = useAuth()
  const navigate = useNavigate()
  return useCallback(
    async (reason: LoginReason = "cikis") => {
      const result = await auth.logout({ redirect: true })
      if (result.kind === "completed") {
        await navigate(paths.login({ reason }), { replace: true })
      }
    },
    [auth, navigate]
  )
}
