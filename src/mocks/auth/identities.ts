import { toLowerTr } from "@/shared/lib/format"

import { db } from "../db"
import { PLATFORM_AGENT, mockUserId } from "../tenancy/users"
import type { MockIdentity } from "./mock-auth-adapter"
import { PLATFORM_ORG, UNPROVISIONED_USER_ID } from "./context"

/** Dev paneli ve E2E `?kullanici=` için kısa kullanıcı anahtarları */
export const PLATFORM_USER_KEY = "destek"
export const UNPROVISIONED_KEY = "kayitsiz"

export function platformIdentity(): MockIdentity {
  return {
    organization: PLATFORM_ORG,
    userId: PLATFORM_AGENT.id,
    name: PLATFORM_AGENT.displayName,
    email: PLATFORM_AGENT.email,
  }
}

/** Kiracı + anahtar → mock kimlik ("admin", "bolge", "destek", "kayitsiz" veya kullanıcı kimliği) */
export function identityFor(tenantSlug: string, key: string): MockIdentity {
  if (key === PLATFORM_USER_KEY) return platformIdentity()
  if (key === UNPROVISIONED_KEY) {
    return {
      organization: tenantSlug,
      userId: UNPROVISIONED_USER_ID,
      name: "Kayıtsız Kullanıcı",
      email: "kayitsiz@ornek.example",
    }
  }
  const id = key.startsWith("u-") ? key : mockUserId(tenantSlug, key)
  const user = db.users.findById(id)
  return {
    organization: user?.tenantId ?? tenantSlug,
    userId: id,
    name: user?.displayName ?? null,
    email: user?.email ?? null,
  }
}

export function defaultIdentity(tenantSlug: string): MockIdentity {
  return tenantSlug === PLATFORM_ORG
    ? platformIdentity()
    : identityFor(tenantSlug, "admin")
}

/** Giriş ekranına yazılan e-posta ile kullanıcı bulunursa o kimlik */
export function identityForEmail(email: string | null): MockIdentity | null {
  if (!email) return null
  const target = toLowerTr(email.trim())
  if (target === PLATFORM_AGENT.email) return platformIdentity()
  const user = db.users.findFirst((item) => toLowerTr(item.email) === target)
  return user
    ? {
        organization: user.tenantId,
        userId: user.id,
        name: user.displayName,
        email: user.email,
      }
    : null
}
