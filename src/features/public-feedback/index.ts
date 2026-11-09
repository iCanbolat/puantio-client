import type { RouteObject } from "react-router"

export * from "./model/feedback"

/**
 * Login'siz QR bildirim sayfası (`/q/:token`). Ayrı ve hafif bir lazy chunk'tır; kiracı
 * kökünün (yapılandırma, kimlik, realtime) dışında render edilir.
 */
export function publicFeedbackRoute(): Pick<RouteObject, "lazy"> {
  return {
    lazy: async () => ({
      Component: (await import("./routes/public-feedback-page"))
        .PublicFeedbackPage,
    }),
  }
}
