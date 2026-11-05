import type { QueryClient } from "@tanstack/react-query"

import { tenantKeys } from "@/entities/tenant"

/**
 * Oturum kapandığında kullanıcıya ait tüm sunucu verisi bellekten silinir (KVKK). Kiracı
 * yapılandırması kullanıcıya ait değildir ve giriş sayfası için gereklidir; korunur.
 */
export function clearUserData(queryClient: QueryClient): void {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== tenantKeys.all[0],
  })
  queryClient.getMutationCache().clear()
}
