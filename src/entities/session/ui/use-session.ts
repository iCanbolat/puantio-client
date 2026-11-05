import { useQuery, useSuspenseQuery } from "@tanstack/react-query"

import { sessionQueries } from "../api/session-api"
import { can, type Me } from "../model/me"
import type { Permission } from "../model/permissions"

/** Oturumdaki kullanıcı. Panel loader'ı `/me`'yi önceden yüklediği için askıya almaz. */
export function useSession(): Me {
  return useSuspenseQuery(sessionQueries.me()).data
}

/** Oturum yoksa (giriş sayfası, public sayfa) `null`. */
export function useOptionalSession(): Me | null {
  return useQuery({ ...sessionQueries.me(), enabled: false }).data ?? null
}

export function useCan(
  permission: Permission | readonly Permission[]
): boolean {
  return can(useOptionalSession(), permission)
}
