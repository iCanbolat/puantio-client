import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildMockTenants, toTenantConfig } from "@/mocks/tenancy/tenants"

import type { AuthAdapter, AuthSession } from "../model/auth-adapter"
import { createAuthController } from "./auth-controller"
import { discoverProvider, emailDomain } from "./provider-discovery"
import { safeReturnTo } from "./return-to"

const tenants = buildMockTenants().map(toTenantConfig)
const group = tenants.find((tenant) => tenant.slug === "cok-hatli-grup")!
const cleaning = tenants.find((tenant) => tenant.slug === "temizlik-orta")!

const {
  signinRedirect,
  signinRedirectCallback,
  signinSilent,
  signoutRedirect,
  removeUser,
  getUser,
  managerSettings,
} = vi.hoisted(() => ({
  signinRedirect: vi.fn(() => Promise.resolve()),
  signinRedirectCallback: vi.fn(),
  signinSilent: vi.fn(),
  signoutRedirect: vi.fn(() => Promise.resolve()),
  removeUser: vi.fn(() => Promise.resolve()),
  getUser: vi.fn(() => Promise.resolve(null)),
  managerSettings: [] as unknown[],
}))

vi.mock("oidc-client-ts", () => ({
  UserManager: class {
    constructor(settings: unknown) {
      managerSettings.push(settings)
    }
    signinRedirect = signinRedirect
    signinRedirectCallback = signinRedirectCallback
    signinSilent = signinSilent
    signoutRedirect = signoutRedirect
    removeUser = removeUser
    getUser = getUser
  },
  WebStorageStateStore: class {
    options: unknown
    constructor(options: unknown) {
      this.options = options
    }
  },
}))

const { createOidcAuthAdapter, readOrganization, toAuthSession } =
  await import("./oidc-auth-adapter")

const user = (overrides: Record<string, unknown> = {}) =>
  ({
    access_token: "erisim",
    id_token: "kimlik",
    expires_at: 2_000_000_000,
    state: { returnTo: "/puantaj" },
    profile: {
      sub: "kc-1",
      name: "Ayşe Yılmaz",
      email: "ayse@lavanta.example",
      organization: ["temizlik-orta"],
      ...overrides,
    },
  }) as never

describe("sağlayıcı keşfi ve dönüş adresi", () => {
  it("TC-1.1-08 e-posta alan adı kurumsal sağlayıcıya, diğerleri yerel hesaba yönlenir", () => {
    expect(emailDomain("Ali@CinarGrup.example")).toBe("cinargrup.example")
    expect(emailDomain("gecersiz")).toBeNull()
    expect(
      discoverProvider(group.auth.providers, "ali@cinargrup.example")?.idpHint
    ).toBe("cinar-google")
    expect(discoverProvider(group.auth.providers, "ali@gmail.com")?.kind).toBe(
      "password"
    )
    expect(
      discoverProvider([group.auth.providers[0]!], "ali@gmail.com")
    ).toBeNull()
  })

  it("açık yönlendirme engellenir", () => {
    expect(safeReturnTo("/personel?sayfa=2")).toBe("/personel?sayfa=2")
    expect(safeReturnTo("//kotu.example")).toBe("/")
    expect(safeReturnTo("https://kotu.example")).toBe("/")
    expect(safeReturnTo("/giris?donus=/x")).toBe("/")
    expect(safeReturnTo(null)).toBe("/")
  })
})

describe("Keycloak (OIDC) adaptörü", () => {
  beforeEach(() => {
    managerSettings.length = 0
    vi.clearAllMocks()
  })

  it("organization claim'inin tüm biçimleri okunur", () => {
    expect(readOrganization({ organization: "acme" })).toBe("acme")
    expect(readOrganization({ organization: ["acme", "diger"] })).toBe("acme")
    expect(readOrganization({ organization: { acme: { id: "1" } } })).toBe(
      "acme"
    )
    expect(readOrganization({})).toBe("")
    expect(toAuthSession(user()).profile).toEqual({
      subject: "kc-1",
      organization: "temizlik-orta",
      name: "Ayşe Yılmaz",
      email: "ayse@lavanta.example",
    })
  })

  it("PKCE redirect ayarları ve kc_idp_hint ile giriş", async () => {
    const adapter = createOidcAuthAdapter(group, {
      origin: "https://cinar.puantio.com",
      store: sessionStorage,
    })
    expect(managerSettings[0]).toMatchObject({
      authority: group.auth.issuer,
      client_id: "puantio-web",
      redirect_uri: "https://cinar.puantio.com/giris/geri-donus",
      response_type: "code",
      scope: "openid profile email organization",
      automaticSilentRenew: false,
    })
    await expect(
      adapter.login({
        returnTo: "/personel",
        idpHint: "cinar-google",
        loginHint: "ali@cinargrup.example",
      })
    ).resolves.toEqual({ kind: "redirect" })
    expect(signinRedirect).toHaveBeenCalledWith({
      state: { returnTo: "/personel" },
      login_hint: "ali@cinargrup.example",
      extraQueryParams: { kc_idp_hint: "cinar-google" },
    })
  })

  it("dönüş, sessiz yenileme ve çıkış", async () => {
    const adapter = createOidcAuthAdapter(cleaning, {
      origin: "https://x.puantio.com",
      store: sessionStorage,
    })
    await adapter.init()
    expect(adapter.getSession()).toBeNull()

    signinRedirectCallback.mockResolvedValueOnce(user())
    await expect(
      adapter.completeLogin("https://x.puantio.com/giris/geri-donus?code=1")
    ).resolves.toEqual({ returnTo: "/puantaj" })
    expect(adapter.getSession()?.accessToken).toBe("erisim")

    signinSilent.mockResolvedValueOnce(user({ sub: "kc-1" }))
    await expect(adapter.refresh()).resolves.toBe(true)
    signinSilent.mockRejectedValueOnce(new Error("login_required"))
    await expect(adapter.refresh()).resolves.toBe(false)

    signinRedirectCallback.mockResolvedValueOnce(
      Object.assign(user(), { state: { returnTo: "https://kotu.example" } })
    )
    await expect(adapter.completeLogin("u")).resolves.toEqual({ returnTo: "/" })

    await expect(adapter.logout({ redirect: false })).resolves.toMatchObject({
      kind: "completed",
    })
    expect(removeUser).toHaveBeenCalled()
    signinRedirectCallback.mockResolvedValueOnce(user())
    await adapter.completeLogin("u")
    await expect(adapter.logout({ redirect: true })).resolves.toEqual({
      kind: "redirect",
    })
    expect(signoutRedirect).toHaveBeenCalledWith({ id_token_hint: "kimlik" })
  })
})

describe("kimlik denetleyicisi", () => {
  const session = (organization: string): AuthSession => ({
    accessToken: `token-${organization}`,
    expiresAt: Date.now() + 60_000,
    profile: { subject: "u", organization, name: null, email: null },
  })
  const fakeAdapter = (organization: string | null): AuthAdapter => ({
    kind: "mock",
    init: () => Promise.resolve(),
    getSession: () => (organization ? session(organization) : null),
    login: () => Promise.resolve({ kind: "completed", returnTo: "/" }),
    completeLogin: () => Promise.resolve({ returnTo: "/" }),
    refresh: () => Promise.resolve(true),
    logout: () => Promise.resolve({ kind: "completed", returnTo: "/giris" }),
  })

  it("TC-1.1-09 token başka kiracıya aitse oturum bu kiracı için geçersizdir", async () => {
    const own = createAuthController(() => fakeAdapter("temizlik-orta"))
    await own.initialize(cleaning)
    expect(own.isSessionForTenant()).toBe(true)
    expect(own.getRequestHeaders()).toEqual({})

    const other = createAuthController(() => fakeAdapter("guvenlik"))
    await other.initialize(cleaning)
    expect(other.isSessionForTenant()).toBe(false)
    own.dispose()
    other.dispose()
  })

  it("platform personeli destek başlığıyla istek atar", async () => {
    const controller = createAuthController(() => fakeAdapter("platform"))
    await controller.initialize(cleaning)
    expect(controller.isSessionForTenant()).toBe(true)
    expect(controller.getRequestHeaders()).toEqual({
      "x-support-tenant": "temizlik-orta",
    })
    expect(controller.getAccessToken()).toBe("token-platform")
    controller.dispose()
  })

  it("başlatılmadan önce güvenli varsayılanlar", async () => {
    const controller = createAuthController(() => fakeAdapter(null))
    expect(controller.isInitialized).toBe(false)
    expect(controller.getSession()).toBeNull()
    await expect(controller.refresh()).resolves.toBe(false)
    expect(() => controller.login({ returnTo: "/" })).toThrow()
    await controller.initialize(cleaning)
    expect(controller.adapterKind).toBe("mock")
    expect(controller.isSessionForTenant()).toBe(false)
    controller.dispose()
  })

  it("TC-1.1-06 başka sekmede çıkış bu sekmeye bildirilir", async () => {
    const controller = createAuthController(() => fakeAdapter("temizlik-orta"))
    await controller.initialize(cleaning)
    const listener = vi.fn()
    const unsubscribe = controller.onRemoteLogout(listener)
    const otherTab = new BroadcastChannel("puantio.temizlik-orta.auth")
    otherTab.postMessage("logout")
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })
    unsubscribe()
    otherTab.close()
    controller.dispose()
  })
})
