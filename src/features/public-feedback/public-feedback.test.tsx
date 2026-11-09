import { screen, waitFor } from "@testing-library/react"
import { http as mswHttp, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { db } from "@/mocks/db"
import { apiPath } from "@/mocks/http"
import { feedbackDemoToken } from "@/mocks/scenarios/phase4"
import { server } from "@/mocks/server"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const TENANT = "temizlik-orta"
const TOKEN = feedbackDemoToken(TENANT)
const OCTOBER = "2026-10-05T10:00:00+03:00"

describe("Batch 4.3 public QR bildirim sayfası", () => {
  it("TC-4.3-01 oturumsuz kullanıcı formu görür ve gönderir; kiracı yapılandırması ve /me istenmez", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("quality-demo")
    const requests: string[] = []
    server.events.on("request:start", ({ request }) => {
      requests.push(new URL(request.url).pathname)
    })
    const { user, container } = renderApp({ route: `/q/${TOKEN}`, user: null })
    expect(
      await screen.findByRole("heading", { name: "Zemin kat WC" })
    ).toBeInTheDocument()
    expect(screen.getByText("Lavanta Tesis Hizmetleri")).toBeInTheDocument()
    expect(screen.getByText("Tuvalet / lavabo · Zemin")).toBeInTheDocument()
    await expectNoA11yViolations(container)

    // Seçim yapmadan gönderilemez
    await user.click(screen.getByRole("button", { name: "Bildir" }))
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Lütfen bir sorun seçin."
    )

    await user.click(screen.getByRole("button", { name: "Kağıt havlu bitti" }))
    expect(
      screen.getByRole("button", { name: "Kağıt havlu bitti" })
    ).toHaveAttribute("aria-pressed", "true")
    await user.type(
      screen.getByLabelText("Not (isteğe bağlı)"),
      "Sağdaki dispenser"
    )
    await user.click(screen.getByRole("button", { name: "Bildir" }))
    expect(
      await screen.findByRole("heading", { name: "Teşekkürler!" })
    ).toBeInTheDocument()
    expect(screen.getByText(/Kayıt no: İE-2026-/)).toBeInTheDocument()

    const order = db.workOrders.findFirst(
      (item) =>
        item.categoryCode === "paper_towel" &&
        item.reports[0]?.note === "Sağdaki dispenser"
    )
    expect(order?.source).toBe("qr_feedback")
    expect(
      requests.some((path) => path.endsWith("/public/tenant-config"))
    ).toBe(false)
    expect(requests.some((path) => path.endsWith("/me"))).toBe(false)
    server.events.removeAllListeners()
  })

  it("TC-4.3-02 iptal edilmiş token anlaşılır hata ekranı gösterir", async () => {
    applyTestScenario("quality-demo")
    renderApp({ route: `/q/${TOKEN}-ESKI`, user: null })
    expect(
      await screen.findByRole("heading", {
        name: "Bu QR kod artık kullanılmıyor",
      })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Yeniden dene" })
    ).not.toBeInTheDocument()
  })

  it("sunucu hatasında yeniden deneme sunulur", async () => {
    server.use(
      mswHttp.get(apiPath("/public/feedback/:token"), () =>
        HttpResponse.json(
          { code: "INTERNAL", message: "Hata" },
          { status: 500 }
        )
      )
    )
    renderApp({ route: "/q/HERHANGI", user: null })
    expect(
      await screen.findByRole("heading", { name: "Sayfa yüklenemedi" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Yeniden dene" })
    ).toBeInTheDocument()
  })

  it("TC-4.3-03 hızlı çift tıklama tek istek gönderir", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("quality-demo")
    let posts = 0
    server.events.on("request:start", ({ request }) => {
      if (
        request.method === "POST" &&
        request.url.includes("/public/feedback/")
      )
        posts += 1
    })
    const { user } = renderApp({ route: `/q/${TOKEN}`, user: null })
    await user.click(await screen.findByRole("button", { name: "Sabun yok" }))
    const submit = screen.getByRole("button", { name: "Bildir" })
    await user.dblClick(submit)
    await user.click(submit).catch(() => undefined)
    expect(
      await screen.findByRole("heading", { name: "Teşekkürler!" })
    ).toBeInTheDocument()
    expect(posts).toBe(1)
    expect(db.feedbackSubmissions.count((item) => item.token === TOKEN)).toBe(1)
    server.events.removeAllListeners()
  })

  it("TC-4.3-05 aynı cihazdan bekleme süresi: sayfa yeniden açılınca form yerine bilgi gösterilir", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("quality-demo")
    const first = renderApp({ route: `/q/${TOKEN}`, user: null })
    await first.user.click(await screen.findByRole("button", { name: "Kirli" }))
    await first.user.click(screen.getByRole("button", { name: "Bildir" }))
    await screen.findByRole("heading", { name: "Teşekkürler!" })
    first.unmount()

    renderApp({ route: `/q/${TOKEN}`, user: null })
    expect(
      await screen.findByRole("heading", { name: "Bildiriminiz alındı" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/2 dakika sonra tekrar deneyebilirsiniz/)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Bildir" })
    ).not.toBeInTheDocument()
  })

  it("sunucu bekleme süresi (429) bilgi ekranına çevrilir", async () => {
    mockClock.freeze(OCTOBER)
    applyTestScenario("quality-demo")
    server.use(
      mswHttp.post(apiPath("/public/feedback/:token"), () =>
        HttpResponse.json(
          { code: "COOLDOWN", message: "Bekleyin" },
          { status: 429 }
        )
      )
    )
    const { user } = renderApp({ route: `/q/${TOKEN}`, user: null })
    await user.click(await screen.findByRole("button", { name: "Kirli" }))
    await user.click(screen.getByRole("button", { name: "Bildir" }))
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Bildiriminiz alındı" })
      ).toBeInTheDocument()
    })
  })
})
