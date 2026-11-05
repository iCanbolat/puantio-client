import { showcaseHandlers } from "@/features/dev-showcase/mocks/handlers"

import { chaosHandler } from "./chaos"
import { importHandlers } from "./import/handlers"
import { masterDataHandlers } from "./master-data/handlers"
import { attendanceHandlers } from "./operations/attendance-handlers"
import { leaveHandlers } from "./operations/leave-handlers"
import { scheduleHandlers } from "./operations/schedule-handlers"
import { timesheetHandlers } from "./operations/timesheet-handlers"
import { platformHandlers } from "./platform/handlers"
import { realtimeHandlers } from "./realtime"
import { systemHandlers } from "./system-handlers"
import { tenancyHandlers } from "./tenancy/handlers"

/**
 * Varsayılan handler zinciri. Sıra önemlidir: kaos handler'ı en başta durur ve
 * hata üretmezse isteği sonraki handler'a bırakır. Her faz kendi handler'larını ekler.
 */
export const handlers = [
  chaosHandler,
  ...systemHandlers,
  ...tenancyHandlers,
  ...masterDataHandlers,
  ...importHandlers,
  ...platformHandlers,
  ...scheduleHandlers,
  ...leaveHandlers,
  ...attendanceHandlers,
  ...timesheetHandlers,
  ...showcaseHandlers,
  ...realtimeHandlers,
]
