import { useQuery } from "@tanstack/react-query"
import { FileSignatureIcon } from "lucide-react"
import { Link } from "react-router"

import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { paths } from "@/shared/config/paths"
import { formatDate } from "@/shared/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"

import { contractQueries } from "../api/contract-api"
import { CONTRACT_TYPE_LABELS } from "../model/contract"
import { ContractStatusBadge } from "./contract-status-badge"

/** Müşteri kartındaki sözleşme listesi */
export function CustomerContractsCard({ customerId }: { customerId: string }) {
  const query = useQuery(
    contractQueries.list({ customerId, page: 1, pageSize: 20 })
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Sözleşmeler</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : query.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={FileSignatureIcon} title="Sözleşme yok" />
        ) : (
          <ul className="divide-y text-sm" aria-label="Müşteri sözleşmeleri">
            {query.data.items.map((contract) => (
              <li
                key={contract.id}
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <Link
                  to={paths.contracts.detail(contract.id)}
                  className="font-medium hover:underline"
                >
                  {contract.code} · {contract.title}
                </Link>
                <span className="text-muted-foreground">
                  {CONTRACT_TYPE_LABELS[contract.type]} ·{" "}
                  {formatDate(contract.startDate)} –{" "}
                  {formatDate(contract.endDate)}
                </span>
                <span className="ml-auto">
                  <ContractStatusBadge status={contract.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
