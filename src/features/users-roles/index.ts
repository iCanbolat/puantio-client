import type { RouteObject } from "react-router"

export {
  roleInputSchema,
  roleSchema,
  tenantUserSchema,
  userInviteSchema,
  type Role,
  type TenantUser,
} from "./model/users-roles"

export function usersRolesRoutes(): Record<
  "users" | "roles",
  Pick<RouteObject, "lazy">
> {
  return {
    users: {
      lazy: async () => ({
        Component: (await import("./routes/users-page")).UsersPage,
      }),
    },
    roles: {
      lazy: async () => ({
        Component: (await import("./routes/roles-page")).RolesPage,
      }),
    },
  }
}
