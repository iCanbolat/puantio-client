import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { z } from "zod"

import { http } from "@/shared/api/http"

import {
  roleListSchema,
  roleSchema,
  tenantUserListSchema,
  tenantUserSchema,
  type RolePayload,
  type UserInvitePayload,
  type UserListParams,
  type UserUpdatePayload,
} from "../model/users-roles"

export const usersRolesKeys = {
  roles: ["roles"] as const,
  users: ["users"] as const,
  userList: (params: UserListParams) =>
    [...usersRolesKeys.users, params] as const,
}

const enc = encodeURIComponent

export const usersRolesQueries = {
  roles: () =>
    queryOptions({
      queryKey: usersRolesKeys.roles,
      queryFn: ({ signal }) =>
        http
          .get("/roles", roleListSchema, { signal })
          .then((data) => data.items),
    }),
  users: (params: UserListParams) =>
    queryOptions({
      queryKey: usersRolesKeys.userList(params),
      queryFn: ({ signal }) =>
        http.get("/users", tenantUserListSchema, { params, signal }),
      placeholderData: keepPreviousData,
    }),
}

export const createRole = (body: RolePayload) =>
  http.post("/roles", roleSchema, { body })
export const updateRole = (id: string, body: RolePayload) =>
  http.patch(`/roles/${enc(id)}`, roleSchema, { body })
export const deleteRole = (id: string) =>
  http.delete(`/roles/${enc(id)}`, z.undefined())

export const inviteUser = (body: UserInvitePayload) =>
  http.post("/users/invitations", tenantUserSchema, { body })
export const updateUser = (id: string, body: UserUpdatePayload) =>
  http.patch(`/users/${enc(id)}`, tenantUserSchema, { body })
export const setUserStatus = (id: string, status: "active" | "disabled") =>
  http.post(`/users/${enc(id)}/status`, tenantUserSchema, { body: { status } })
