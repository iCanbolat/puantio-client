import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useTenant } from "@/entities/tenant"
import { useRealtimeEvent } from "@/shared/api/realtime-hooks"
import { useUiStore } from "@/shared/stores/ui-store"

import { attendanceEvents, attendanceKeys } from "../api/attendance-api"
import { playAlarmSound, showAlarmNotification } from "./alarm-signals"

/**
 * Panel genelinde gerçek zamanlı yoklama olaylarını dinler: ilgili sorguları tazeler,
 * yeni alarmda ses, tarayıcı bildirimi ve toast üretir. Olaylar kiracıya göre süzülür.
 */
export function AttendanceRealtimeBridge() {
  const queryClient = useQueryClient()
  const tenant = useTenant()
  const soundEnabled = useUiStore((state) => state.alarmSoundEnabled)
  const refresh = (payload: { tenantId: string }) => {
    if (payload.tenantId !== tenant.slug) return false
    void queryClient.invalidateQueries({ queryKey: attendanceKeys.all })
    return true
  }
  useRealtimeEvent(attendanceEvents.alarmCreated, ({ payload }) => {
    if (!refresh(payload)) return
    toast.warning("Yeni gelmeyen personel alarmı", {
      description: "Alarm merkezinden müdahale edin.",
    })
    if (soundEnabled) playAlarmSound()
    showAlarmNotification(
      "Gelmeyen personel alarmı",
      "Vardiyaya giriş yapılmadı."
    )
  })
  useRealtimeEvent(attendanceEvents.alarmUpdated, ({ payload }) => {
    refresh(payload)
  })
  useRealtimeEvent(attendanceEvents.alarmResolved, ({ payload }) => {
    refresh(payload)
  })
  useRealtimeEvent(attendanceEvents.checkedIn, ({ payload }) => {
    refresh(payload)
  })
  useRealtimeEvent(attendanceEvents.attendanceUpdated, ({ payload }) => {
    refresh(payload)
  })
  return null
}
