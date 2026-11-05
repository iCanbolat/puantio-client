import { useQuery } from "@tanstack/react-query"

import { leaveQueries } from "@/entities/leave"
import { ErrorState } from "@/shared/components/error-state"
import { StatCard } from "@/shared/components/stat-card"

/** Yıllık izin bakiyesi (personel kartı İzin sekmesi) */
export function LeaveBalanceCard({ personnelId }: { personnelId: string }) {
  const query = useQuery(leaveQueries.balance(personnelId))
  if (query.isError) {
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  }
  const data = query.data
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <StatCard
        label={`${data?.year ?? ""} yıllık izin hakkı`}
        value={data ? `${data.entitlement} gün` : "—"}
        hint={data ? `Kıdem ${data.seniorityYears} yıl` : undefined}
        isLoading={query.isPending}
      />
      <StatCard
        label="Kullanılan"
        value={data ? `${data.used} gün` : "—"}
        isLoading={query.isPending}
      />
      <StatCard
        label="Onay bekleyen"
        value={data ? `${data.pending} gün` : "—"}
        tone={data && data.pending > 0 ? "warning" : "default"}
        isLoading={query.isPending}
      />
      <StatCard
        label="Kalan"
        value={data ? `${data.remaining} gün` : "—"}
        tone={data && data.remaining < 0 ? "danger" : "success"}
        isLoading={query.isPending}
      />
    </div>
  )
}
