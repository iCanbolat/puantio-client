import { http } from "msw"

import { mockClock } from "./clock"
import { apiPath, ok } from "./http"

export const systemHandlers = [
  http.get(apiPath("/system/time"), () =>
    ok({ serverTime: mockClock.now().toISOString() })
  ),
  http.get(apiPath("/system/health"), () =>
    ok({ status: "ok" as const, mocked: true })
  ),
]
