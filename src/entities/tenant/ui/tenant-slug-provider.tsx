import type { ReactNode } from "react"

import { TenantSlugContext } from "./tenant-slug-context"

export function TenantSlugProvider({
  slug,
  children,
}: {
  slug: string
  children: ReactNode
}) {
  return <TenantSlugContext value={slug}>{children}</TenantSlugContext>
}
