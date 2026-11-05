# Puantio: Web İstemcisi

Tesis hizmetleri firmaları için çok kiracılı (SaaS) operasyon platformu.

Saha personeli, puantaj, sözleşme/hakediş, kalite, stok ve İSG modüllerinin web yönetim paneli,
müşteri portalı ve QR bildirim sayfası.

- Geliştirme planı ve faz durumu: [`../.claude/FRONTEND_PLAN.md`](../.claude/FRONTEND_PLAN.md)
- Yığın: Vite 8 · React 19 · TypeScript 6 · Tailwind 4 · shadcn/ui (Base UI) · React Router 8 ·
  TanStack Query 5 / Table 9 · Zustand · Zod 4 · MSW 2 · Vitest 5 · Playwright

## Başlangıç

```bash
pnpm install
pnpm dev
```

Varsayılan olarak **mock modunda** çalışır (`.env.development` → `VITE_API_MOCKING=true`). Tüm API'ler
tarayıcıda MSW ile simüle edilir. Sağ alttaki **Mock** panelinden senaryo, veri seti, sunucu saati ve
ağ koşulları değiştirilebilir. Aynı ayarlar URL ile de verilebilir:

```
http://localhost:5173/gelistirici/bilesenler?senaryo=server-error&veri=test&saat=2026-09-29T07:10:00%2B03:00
```

Ortak bileşenlerin canlı örnekleri: `/gelistirici/bilesenler` (yalnızca mock modunda).

## Komutlar

| Komut                           | Açıklama                                             |
| ------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                      | Geliştirme sunucusu                                  |
| `pnpm typecheck`                | TypeScript (proje referanslarıyla)                   |
| `pnpm lint`                     | ESLint (katman kuralları dahil)                      |
| `pnpm test` / `pnpm test:watch` | Birim + entegrasyon testleri (Vitest, jsdom, MSW)    |
| `pnpm test:coverage`            | Kapsam eşikleriyle                                   |
| `pnpm test:e2e`                 | Playwright (masaüstü + mobil, mock API)              |
| `pnpm build`                    | Production paketi (mock kodu içermez)                |
| `pnpm verify`                   | typecheck → lint → prettier → coverage → build → e2e |

## Mimari özet

`app → features → entities → shared` katmanları; bir feature'a yalnızca `index.ts` üzerinden erişilir.
Uygulama kodu `@/mocks` ve `@/test` import edemez. Kurallar `eslint.config.js` içinde tanımlıdır.
Ayrıntılar plan dosyasının 2. bölümünde.
