import type { Permission } from "@/entities/session"

import type { PeriodAction, PeriodStatus } from "../model/timesheet"

const ACTION_PERMISSIONS: Record<PeriodAction, Permission> = {
  approve_region: "timesheet:approve_region",
  approve_customer: "timesheet:approve_customer",
  approve_hr: "timesheet:approve_hr",
  lock: "timesheet:approve_hr",
  reopen: "timesheet:approve_hr",
}

/**
 * Dönem durum makinesi. Geçersiz geçişte `null` döner (sunucu 409 verir).
 * Müşteri onayı yalnızca personel temini (staffing) içeren dönemlerde zorunludur.
 */
export function nextPeriodStatus(
  status: PeriodStatus,
  action: PeriodAction,
  customerApprovalRequired: boolean
): PeriodStatus | null {
  switch (action) {
    case "approve_region":
      return status === "open" ? "region_approved" : null
    case "approve_customer":
      return customerApprovalRequired && status === "region_approved"
        ? "customer_approved"
        : null
    case "approve_hr":
      if (status === "customer_approved") return "hr_approved"
      return status === "region_approved" && !customerApprovalRequired
        ? "hr_approved"
        : null
    case "lock":
      return status === "hr_approved" ? "locked" : null
    case "reopen":
      return status === "region_approved" ||
        status === "customer_approved" ||
        status === "hr_approved"
        ? "open"
        : null
  }
}

export function availablePeriodActions(
  status: PeriodStatus,
  customerApprovalRequired: boolean,
  permissions: ReadonlySet<Permission>
): PeriodAction[] {
  return (Object.keys(ACTION_PERMISSIONS) as PeriodAction[]).filter(
    (action) =>
      permissions.has(ACTION_PERMISSIONS[action]) &&
      nextPeriodStatus(status, action, customerApprovalRequired) !== null
  )
}

/** Hücre düzenlenebilir mi: kilitli ve İK onaylı dönemde hayır */
export function isPeriodEditable(status: PeriodStatus): boolean {
  return status !== "locked" && status !== "hr_approved"
}

/** Değişiklik fark listesine yazılır mı: bölge onayından sonra yapılan düzenlemeler */
export function tracksChanges(status: PeriodStatus): boolean {
  return status !== "open"
}

export const PERIOD_STEPS: readonly PeriodStatus[] = [
  "open",
  "region_approved",
  "customer_approved",
  "hr_approved",
  "locked",
]
