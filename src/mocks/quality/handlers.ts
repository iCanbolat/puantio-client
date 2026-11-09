import { auditHandlers } from "./audit-handlers"
import { feedbackHandlers } from "./feedback-handlers"
import { portalHandlers } from "./portal-handlers"
import { templateHandlers } from "./template-handlers"
import { workOrderHandlers } from "./work-order-handlers"

/** Faz 4: kalite denetim, QR bildirim, iş emirleri ve müşteri portalı */
export const qualityHandlers = [
  ...templateHandlers,
  ...auditHandlers,
  ...feedbackHandlers,
  ...workOrderHandlers,
  ...portalHandlers,
]
