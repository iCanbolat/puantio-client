import { useEffect } from "react"

import type { StatusTone } from "@/shared/components/status-badge"

import type { AttendanceStatus } from "../model/attendance"

export const ATTENDANCE_STATUS_TONES: Record<AttendanceStatus, StatusTone> = {
  expected: "neutral",
  checked_in: "success",
  late: "warning",
  no_show: "danger",
  backup_assigned: "info",
  checked_out: "neutral",
}

/** Sekme başlığında açık alarm sayacı: "(3) Lavanta · Puantio" */
export function useTitleCounter(count: number): void {
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "")
    document.title = count > 0 ? `(${count}) ${base}` : base
    return () => {
      document.title = document.title.replace(/^\(\d+\) /, "")
    }
  }, [count])
}
