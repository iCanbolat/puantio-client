import type { PersonnelStatus } from "@/entities/personnel"
import type { StatusTone } from "@/shared/components/status-badge"

export const STATUS_TONES: Record<PersonnelStatus, StatusTone> = {
  active: "success",
  passive: "warning",
  terminated: "neutral",
}
