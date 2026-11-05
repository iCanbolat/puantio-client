import type { ReactNode } from "react"

import type { AuthController } from "../lib/auth-controller"
import { AuthContext } from "./auth-context"

export function AuthProvider({
  controller,
  children,
}: {
  controller: AuthController
  children: ReactNode
}) {
  return <AuthContext value={controller}>{children}</AuthContext>
}
