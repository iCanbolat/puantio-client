import type { RouteObject } from "react-router"

/** Organizasyon ayarları: tüzel kişilikler ve organizasyon birimleri (lazy chunk'lar). */
export function organizationRoutes(): Record<
  "legalEntities" | "orgUnits",
  Pick<RouteObject, "lazy">
> {
  return {
    legalEntities: {
      lazy: async () => ({
        Component: (await import("./routes/legal-entities-page"))
          .LegalEntitiesPage,
      }),
    },
    orgUnits: {
      lazy: async () => ({
        Component: (await import("./routes/org-units-page")).OrgUnitsPage,
      }),
    },
  }
}
