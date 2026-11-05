import type { ReactNode } from "react"

import type { Permission } from "../model/permissions"
import { useCan } from "./use-session"

/** Yetkisi olmayan kullanıcıya içerik DOM'a hiç eklenmez (gizleme değil). */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | readonly Permission[]
  children: ReactNode
  fallback?: ReactNode
}) {
  return useCan(permission) ? children : fallback
}
