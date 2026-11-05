import { useMutation, useQuery } from "@tanstack/react-query"
import { CheckIcon } from "lucide-react"

import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"

import { portalApprovalsQuery } from "../api/portal-api"
import { timesheetKeys, transitionPeriod } from "../api/timesheet-api"
import { monthLabel } from "./period-format"

/** Müşteri portalı: personel temini dönemlerinin müşteri onayı */
export function CustomerTimesheetApprovals() {
  const query = useQuery(portalApprovalsQuery())
  const approve = useMutation({
    mutationFn: (periodId: string) =>
      transitionPeriod(periodId, "approve_customer"),
    meta: {
      successMessage: "Puantaj onaylandı",
      invalidates: [timesheetKeys.all],
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Puantaj onayları</CardTitle>
        <CardDescription>
          Personel temini hizmetindeki çalışanların aylık puantajı, bordroya
          geçmeden önce onayınıza sunulur.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : query.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : query.data.items.length === 0 ? (
          <EmptyState title="Onay bekleyen puantaj yok" />
        ) : (
          <ul className="divide-y" aria-label="Onay bekleyen dönemler">
            {query.data.items.map((period) => (
              <li
                key={period.id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <span className="flex flex-col">
                  <span className="font-medium capitalize">
                    {monthLabel(period.month)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {period.legalEntityTitle}
                  </span>
                </span>
                <Button
                  className="ml-auto"
                  onClick={() => {
                    approve.mutate(period.id)
                  }}
                  disabled={approve.isPending}
                >
                  <CheckIcon data-icon="inline-start" />
                  Onayla
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
