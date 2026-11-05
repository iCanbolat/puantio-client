/**
 * Mock erişim token'ı: `mock.<organization>.<userId>.<expiresAtMs>`. Gerçek Keycloak JWT'sinin
 * yalnızca uygulamanın kullandığı alanlarını taşır (organization, sub, exp).
 */
export interface MockTokenClaims {
  organization: string
  userId: string
  expiresAt: number
}

export function mintMockToken(claims: MockTokenClaims): string {
  return `mock.${claims.organization}.${claims.userId}.${claims.expiresAt}`
}

export function parseMockToken(token: string): MockTokenClaims | null {
  const parts = token.split(".")
  if (parts.length !== 4 || parts[0] !== "mock") return null
  const [, organization, userId, exp] = parts
  const expiresAt = Number(exp)
  if (!organization || !userId || !Number.isFinite(expiresAt)) return null
  return { organization, userId, expiresAt }
}
