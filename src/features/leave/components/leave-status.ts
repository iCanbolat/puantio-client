import type { LeaveStatus } from "@/entities/leave"
import type { StatusTone } from "@/shared/components/status-badge"

export const LEAVE_STATUS_TONES: Record<LeaveStatus, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
}
