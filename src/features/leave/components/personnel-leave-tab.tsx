import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useState } from "react"

import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  leaveQueries,
} from "@/entities/leave"
import { Can } from "@/entities/session"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatDate } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"

import { LeaveBalanceCard } from "./leave-balance-card"
import { LeaveRequestDialog } from "./leave-request-dialog"
import { LEAVE_STATUS_TONES } from "./leave-status"

/** Personel kartı "İzin" sekmesi */
export function PersonnelLeaveTab({
  personnelId,
  personnelName,
}: {
  personnelId: string
  personnelName: string
}) {
  const [creating, setCreating] = useState(false)
  const query = useQuery(
    leaveQueries.list({
      page: 1,
      pageSize: 50,
      personnelId,
      sort: undefined,
      order: undefined,
      q: undefined,
      status: undefined,
      type: undefined,
      orgUnitId: undefined,
      month: undefined,
    })
  )
  return (
    <div className="flex flex-col gap-4">
      <LeaveBalanceCard personnelId={personnelId} />
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold">İzin geçmişi</h3>
        <Can permission="leave:request">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon data-icon="inline-start" />
            İzin gir
          </Button>
        </Can>
      </div>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="İzin kaydı yok" />
      ) : (
        <ul className="divide-y rounded-lg border" aria-label="İzin geçmişi">
          {query.data.items.map((leave) => (
            <li
              key={leave.id}
              className="flex flex-wrap items-center gap-3 p-3 text-sm"
            >
              <span className="min-w-32 font-medium">
                {LEAVE_TYPE_LABELS[leave.type]}
              </span>
              <span className="tabular-nums">
                {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
              </span>
              <span className="text-muted-foreground">
                {leave.days} iş günü
              </span>
              <StatusBadge
                tone={LEAVE_STATUS_TONES[leave.status]}
                className="ml-auto"
              >
                {LEAVE_STATUS_LABELS[leave.status]}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
      <LeaveRequestDialog
        open={creating}
        personnel={{ id: personnelId, name: personnelName }}
        onClose={() => {
          setCreating(false)
        }}
      />
    </div>
  )
}
