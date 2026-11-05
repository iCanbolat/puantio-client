import type { RouteObject } from "react-router"

export {
  LOGO_BORDRO_PLUS,
  GENERIC_CSV,
  PAYROLL_LIBRARY,
} from "./domain/library"

export function payrollRoutes(): Record<
  "exports" | "profiles",
  Pick<RouteObject, "lazy">
> {
  return {
    exports: {
      lazy: async () => ({
        Component: (await import("./routes/exports-page")).ExportsPage,
      }),
    },
    profiles: {
      lazy: async () => ({
        Component: (await import("./routes/profiles-page")).ProfilesPage,
      }),
    },
  }
}
