import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { act } from "react"
import { describe, expect, it, vi } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { renderApp } from "@/test/render"

import { IdleSessionGuard } from "./components/idle-session-guard"

describe("Faz 1.1 kimlik doğrulama (Keycloak / mock adaptör)", () => {
  it("TC-1.1-01 oturumsuz /puantaj ziyareti giriş sayfasına dönüş adresiyle gider, girişten sonra geri döner", async () => {
    const { router, user } = renderApp({
      tenant: "cok-hatli-grup",
      user: null,
      route: "/puantaj",
    })
    expect(
      await screen.findByRole("heading", { name: "Çınar Şirketler Grubu" })
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/giris")
    expect(router.state.location.search).toBe("?donus=%2Fpuantaj")
    expect(
      screen.getByRole("button", { name: "Google ile giriş yap" })
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "E-posta ile giriş yap" })
    )
    expect(
      await screen.findByText("Bu modül Faz 2'de geliştirilecek.")
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/puantaj")
  })

  it("TC-1.1-08 kiracıda tek sağlayıcı (Google) varsa doğrudan kc_idp_hint ile yönlendirilir", async () => {
    const tenant = db.tenants.findById("cok-hatli-grup")!
    db.tenants.update(tenant.id, {
      auth: {
        ...tenant.auth,
        providers: tenant.auth.providers.filter(
          (provider) => provider.kind === "google"
        ),
      },
    })
    const { router, getAuthAdapter } = renderApp({
      tenant: "cok-hatli-grup",
      user: null,
      loginAs: "admin",
      route: "/personel",
    })
    expect(
      await screen.findByRole("heading", { name: "Personel" })
    ).toBeInTheDocument()
    expect(getAuthAdapter().loginCalls).toEqual([
      { idpHint: "cinar-google", loginHint: null },
    ])
    expect(router.state.location.pathname).toBe("/personel")
  })

  it("e-posta alan adıyla sağlayıcı keşfi", async () => {
    const { user, getAuthAdapter } = renderApp({
      tenant: "cok-hatli-grup",
      user: null,
      route: "/giris",
    })
    await user.type(
      await screen.findByLabelText("E-posta adresi"),
      "elif.kaya@cinargrup.example"
    )
    await user.click(
      screen.getByRole("button", { name: "E-posta ile giriş yap" })
    )
    await waitFor(() => {
      expect(getAuthAdapter().loginCalls[0]).toEqual({
        idpHint: "cinar-google",
        loginHint: "elif.kaya@cinargrup.example",
      })
    })
  })

  it("TC-1.1-02 erişim token'ı süresi dolunca sessizce yenilenir, istek tekrarlanır", async () => {
    const { user, getAuthAdapter } = renderApp({ route: "/personel" })
    expect(
      await screen.findByRole("table", { name: "Personel listesi" })
    ).toBeInTheDocument()
    const before = getAuthAdapter().getSession()?.accessToken
    mockClock.travelTo(new Date(Date.now() + 20 * 60_000))
    await user.click(screen.getByRole("link", { name: /Müşteriler/ }))
    expect(
      await screen.findByRole("table", { name: "Müşteriler" })
    ).toBeInTheDocument()
    expect(getAuthAdapter().getSession()?.accessToken).not.toBe(before)
  })

  it("TC-1.1-03 sessiz yenileme başarısızsa giriş sayfasına dönüş adresiyle yönlendirilir", async () => {
    const { user, router, getAuthAdapter } = renderApp({ route: "/personel" })
    expect(
      await screen.findByRole("table", { name: "Personel listesi" })
    ).toBeInTheDocument()
    getAuthAdapter().expireRefresh()
    mockClock.travelTo(new Date(Date.now() + 20 * 60_000))
    await user.click(screen.getByRole("link", { name: /Müşteriler/ }))
    expect(
      await screen.findByText("Oturumunuzun süresi doldu")
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/giris")
    expect(router.state.location.search).toContain("donus=%2Fmusteriler")
    expect(getAuthAdapter().getSession()).toBeNull()
  })

  it("TC-1.1-04 Keycloak hesabı uygulamada tanımlı değil", async () => {
    const { router } = renderApp({ user: "kayitsiz" })
    expect(
      await screen.findByRole("heading", {
        name: "Hesabınız yetkilendirilmemiş",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Lavanta Tesis Hizmetleri içinde size tanımlı bir kullanıcı yok/
      )
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/hesap-yetkisiz")
  })

  it("devre dışı kullanıcı da yetkisiz hesap ekranına düşer", async () => {
    renderApp({ user: "pasif" })
    expect(
      await screen.findByRole("heading", {
        name: "Hesabınız yetkilendirilmemiş",
      })
    ).toBeInTheDocument()
  })

  it("TC-1.1-05 etkileşim yoksa önce uyarı, sonra çıkış", () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    render(
      <IdleSessionGuard
        timeoutMs={10_000}
        warningMs={3000}
        onTimeout={onTimeout}
      />
    )
    act(() => {
      vi.advanceTimersByTime(7100)
    })
    expect(
      screen.getByRole("alertdialog", { name: "Oturumunuz kapanmak üzere" })
    ).toBeInTheDocument()
    expect(screen.getByText("3 sn")).toBeInTheDocument()
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Oturumu sürdür" }))
    })
    act(() => {
      vi.advanceTimersByTime(3100)
    })
    expect(onTimeout).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(7100)
    })
    act(() => {
      vi.advanceTimersByTime(3100)
    })
    expect(onTimeout).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("TC-1.1-06 başka sekmede çıkış yapılınca bu sekme giriş ekranına döner", async () => {
    const { router } = renderApp()
    expect(
      await screen.findByRole("heading", { name: "Operasyon paneli" })
    ).toBeInTheDocument()
    const otherTab = new BroadcastChannel("puantio.temizlik-orta.auth")
    otherTab.postMessage("logout")
    expect(await screen.findByText("Çıkış yaptınız")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/giris")
    otherTab.close()
  })

  it("kullanıcı menüsünden çıkış", async () => {
    const { user, router, getAuthAdapter } = renderApp()
    await user.click(
      await screen.findByRole("button", {
        name: "Kullanıcı menüsü: Ayşe Yılmaz",
      })
    )
    await user.click(await screen.findByRole("menuitem", { name: "Çıkış yap" }))
    expect(await screen.findByText("Çıkış yaptınız")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/giris")
    expect(getAuthAdapter().getSession()).toBeNull()
  })

  it("TC-1.1-07 mock rol seçimi: rolün menü ve yetkileri uygulanır", async () => {
    const admin = renderApp()
    const adminNav = await screen.findByLabelText("Ana menü")
    expect(
      within(adminNav).getByRole("link", { name: /Kullanıcılar/ })
    ).toBeInTheDocument()
    expect(
      within(adminNav).getByRole("link", { name: /Müşteriler/ })
    ).toBeInTheDocument()
    admin.unmount()

    renderApp({ user: "supervizor" })
    const nav = await screen.findByLabelText("Ana menü")
    await within(nav).findByRole("link", { name: /Personel/ })
    expect(
      within(nav).queryByRole("link", { name: /Kullanıcılar/ })
    ).not.toBeInTheDocument()
    expect(
      within(nav).queryByRole("link", { name: /Müşteriler/ })
    ).not.toBeInTheDocument()
    expect(within(nav).queryByText("Hakediş")).not.toBeInTheDocument()
  })

  it("TC-1.1-09 token'daki organization alt alan adındaki kiracıyla uyuşmazsa oturum reddedilir", async () => {
    const { router, getAuthAdapter } = renderApp({ user: "u-guvenlik-admin" })
    expect(
      await screen.findByText("Bu hesap bu firmaya ait değil")
    ).toBeInTheDocument()
    expect(router.state.location.search).toContain("neden=kiraci-uyusmazligi")
    expect(getAuthAdapter().getSession()).toBeNull()
  })
})
