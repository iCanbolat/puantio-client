import type { Permission } from "@/entities/session"

import type {
  ProgressPaymentAction,
  ProgressPaymentStatus,
} from "../model/progress-payment"

/** Durum makinesi. Geçersiz geçişte `null` (sunucu 409 verir). */
export function nextPaymentStatus(
  status: ProgressPaymentStatus,
  action: ProgressPaymentAction
): ProgressPaymentStatus | null {
  switch (action) {
    case "submit":
      return status === "draft" ? "review" : null
    case "send_to_customer":
      return status === "review" ? "customer_approval" : null
    case "approve_customer":
      return status === "customer_approval" ? "approved" : null
    case "invoice":
      return status === "approved" ? "invoiced" : null
    case "return_to_draft":
      return status === "review" || status === "customer_approval"
        ? "draft"
        : null
  }
}

function permitted(
  action: ProgressPaymentAction,
  permissions: ReadonlySet<Permission>
): boolean {
  if (action === "approve_customer")
    return (
      permissions.has("progress_payment:approve") ||
      permissions.has("progress_payment:approve_customer")
    )
  return permissions.has("progress_payment:approve")
}

/**
 * Kullanıcının yapabileceği geçişler. Kontrole gönderme için kaynak puantaj dönemi İK onaylı
 * veya kilitli olmalıdır.
 */
export function availablePaymentActions(
  status: ProgressPaymentStatus,
  permissions: ReadonlySet<Permission>,
  timesheetApproved: boolean
): ProgressPaymentAction[] {
  const actions: ProgressPaymentAction[] = [
    "submit",
    "send_to_customer",
    "approve_customer",
    "invoice",
    "return_to_draft",
  ]
  return actions.filter(
    (action) =>
      permitted(action, permissions) &&
      nextPaymentStatus(status, action) !== null &&
      (action !== "submit" || timesheetApproved)
  )
}

/** Yeniden hesaplama ve ceza düzenleme yalnızca taslak ve kontrol aşamasında */
export function isPaymentEditable(status: ProgressPaymentStatus): boolean {
  return status === "draft" || status === "review"
}

export const PAYMENT_STEPS: readonly ProgressPaymentStatus[] = [
  "draft",
  "review",
  "customer_approval",
  "approved",
  "invoiced",
]
