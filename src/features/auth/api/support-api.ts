import { z } from "zod"

import { http } from "@/shared/api/http"

/** Platform personelinin açık destek oturumunu bitirir (kiracı adresinden). */
export function endCurrentSupportSession() {
  return http.post("/support-sessions/current/end", z.undefined())
}
