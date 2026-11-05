import { useQuery } from "@tanstack/react-query"
import { BellRingIcon } from "lucide-react"
import { useState } from "react"

import { OrgUnitSelect } from "@/entities/org-unit"
import { useTerms } from "@/entities/tenant"
import { usePollingFallback } from "@/shared/api/realtime-hooks"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { Skeleton } from "@/shared/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs"

import { ATTENDANCE_POLL_MS, attendanceQueries } from "../api/attendance-api"
import {
  AlarmActionDialog,
  type AlarmAction,
} from "../components/alarm-dialogs"
import { AlarmCard } from "../components/alarm-card"
import { useTitleCounter } from "../components/attendance-format"
import { LiveControls } from "../components/live-controls"
import { alarmListParamsSchema, type Alarm } from "../model/attendance"

export function AlarmsPage() {
  const terms = useTerms()
  const [params, setParams] = useSearchParamsState(alarmListParamsSchema)
  const refetchInterval = usePollingFallback(ATTENDANCE_POLL_MS)
  const query = useQuery({
    ...attendanceQueries.alarms(params),
    refetchInterval,
  })
  const [action, setAction] = useState<{
    alarm: Alarm
    action: AlarmAction
  } | null>(null)
  const counts = query.data?.counts
  useTitleCounter(counts?.active ?? 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Alarm merkezi"
        description="Vardiya başlangıcı + tolerans içinde giriş yapılmayan vardiyalar. SLA dolmadan yedek atayın veya gerekçeyle kapatın; çözülmeyen alarm operasyon müdürüne eskale edilir."
      />
      <LiveControls />
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={params.durum}
          onValueChange={(value) => {
            setParams({ durum: value as typeof params.durum })
          }}
        >
          <TabsList>
            <TabsTrigger value="aktif">
              Aktif ({counts?.active ?? 0})
            </TabsTrigger>
            <TabsTrigger value="eskale">
              Eskale ({counts?.escalated ?? 0})
            </TabsTrigger>
            <TabsTrigger value="cozulen">
              Bugün çözülen ({counts?.resolvedToday ?? 0})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <OrgUnitSelect
          allowAll
          value={params.orgUnitId ?? null}
          onValueChange={(orgUnitId) => {
            setParams({ orgUnitId: orgUnitId ?? undefined })
          }}
          className="h-8 w-48"
          aria-label={`${terms.orgLevels[0]?.singular ?? "Bölge"} filtresi`}
        />
      </div>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={BellRingIcon}
          title={
            params.durum === "cozulen"
              ? "Bugün çözülen alarm yok"
              : "Açık alarm yok"
          }
          description="Tüm vardiyalar zamanında başladı."
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="Alarmlar">
          {query.data.items.map((alarm) => (
            <AlarmCard
              key={alarm.id}
              alarm={alarm}
              onAction={(next) => {
                setAction({ alarm, action: next })
              }}
            />
          ))}
        </ul>
      )}
      <AlarmActionDialog
        alarm={action?.alarm ?? null}
        action={action?.action ?? "note"}
        onClose={() => {
          setAction(null)
        }}
      />
    </div>
  )
}
