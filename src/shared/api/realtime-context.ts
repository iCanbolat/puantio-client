import { createContext } from "react"

import type { RealtimeClient } from "./realtime"

export const RealtimeContext = createContext<RealtimeClient | null>(null)
