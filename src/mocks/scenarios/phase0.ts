import { delay, http } from "msw"

import { clearTenantData, db } from "../db"
import { apiPath, ok, problem } from "../http"
import { defineScenario } from "./types"

/** Sistem, kiracı yapılandırması ve oturum (`/me`) uçları: uygulama kabuğu her senaryoda açılabilsin */
const isShell = (request: Request) => {
  const { pathname } = new URL(request.url)
  return (
    pathname.includes("/system/") ||
    pathname.includes("/public/") ||
    pathname.endsWith("/api/me")
  )
}
/** "Oturum düşmüş" senaryosunda `/me` de 401 döner (giriş sayfasına dönülür) */
const isSystem = (request: Request) => {
  const { pathname } = new URL(request.url)
  return pathname.includes("/system/") || pathname.includes("/public/")
}

export const defaultScenario = defineScenario({
  id: "default",
  label: "Varsayılan",
  description: "Seed verisiyle normal çalışan API.",
  phase: 0,
})

export const emptyScenario = defineScenario({
  id: "empty",
  label: "Boş veri",
  description: "Tüm listeler boş döner (boş durum ekranları).",
  phase: 0,
  setup: () => {
    // Kiracılar ve kullanıcılar kalır (giriş yapılabilsin); iş verisi boşalır
    db.showcaseRecords.clear()
    clearTenantData()
  },
})

export const serverErrorScenario = defineScenario({
  id: "server-error",
  label: "Sunucu hatası",
  description:
    "Sistem, kiracı yapılandırması ve oturum uçları hariç tüm istekler 500 döner.",
  phase: 0,
  handlers: () => [
    http.all(apiPath("/*"), ({ request }) =>
      isShell(request) ? undefined : problem(500, "INTERNAL", "Sunucu hatası.")
    ),
  ],
})

export const slowNetworkScenario = defineScenario({
  id: "slow-network",
  label: "Yavaş ağ",
  description:
    "Her istek 2,5 sn gecikir (bodrum kat / zayıf çekim simülasyonu).",
  phase: 0,
  handlers: () => [
    http.all(apiPath("/*"), async ({ request }) => {
      if (!isShell(request)) await delay(2500)
      return undefined
    }),
  ],
})

export const unauthorizedScenario = defineScenario({
  id: "unauthorized",
  label: "Oturum düşmüş",
  description:
    "Sistem ve kiracı yapılandırması hariç tüm istekler 401 döner (yenileme de başarısız).",
  phase: 0,
  handlers: () => [
    http.all(apiPath("/*"), ({ request }) =>
      isSystem(request)
        ? undefined
        : problem(401, "UNAUTHENTICATED", "Oturumunuzun süresi doldu.")
    ),
  ],
})

export const contractDriftScenario = defineScenario({
  id: "contract-drift",
  label: "Kontrat kayması",
  description:
    "Vitrin listesi şemaya uymayan veri döner (backend sözleşmeyi bozdu).",
  phase: 0,
  handlers: () => [
    http.get(apiPath("/showcase/records"), () =>
      ok({
        items: [{ id: 1, code: "HATALI", score: "yüksek" }],
        meta: { page: 1 },
      })
    ),
  ],
})

export const phase0Scenarios = [
  defaultScenario,
  emptyScenario,
  serverErrorScenario,
  slowNetworkScenario,
  unauthorizedScenario,
  contractDriftScenario,
]
