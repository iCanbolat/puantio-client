import { useQueryClient } from "@tanstack/react-query"

import { useTenant } from "@/entities/tenant"
import { useRealtimeEvent } from "@/shared/api/realtime-hooks"

import { workOrderEvents, workOrderKeys } from "../api/work-order-api"

/**
 * Panel ve portal genelinde iş emri olaylarını dinler: liste, pano ve detay sorgularını
 * tazeler. Olaylar kiracıya göre süzülür (kanal tüm kiracılara yayın yapar).
 */
export function WorkOrderRealtimeBridge() {
  const queryClient = useQueryClient()
  const tenant = useTenant()
  const refresh = ({ payload }: { payload: { tenantId: string } }) => {
    if (payload.tenantId !== tenant.slug) return
    void queryClient.invalidateQueries({ queryKey: workOrderKeys.all })
  }
  useRealtimeEvent(workOrderEvents.created, refresh)
  useRealtimeEvent(workOrderEvents.updated, refresh)
  return null
}
