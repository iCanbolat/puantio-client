import { createContext, useContext } from "react"

import type { AuthController } from "../lib/auth-controller"

export const AuthContext = createContext<AuthController | null>(null)

export function useAuth(): AuthController {
  const controller = useContext(AuthContext)
  if (!controller) throw new Error("AuthProvider eksik")
  return controller
}
