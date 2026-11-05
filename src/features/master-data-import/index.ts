import type { RouteObject } from "react-router"

/** Excel içe aktarma sihirbazı (SheetJS ayrı chunk'ta yüklenir). */
export function importRoute(): Pick<RouteObject, "lazy"> {
  return {
    lazy: async () => ({
      Component: (await import("./routes/import-page")).ImportPage,
    }),
  }
}
