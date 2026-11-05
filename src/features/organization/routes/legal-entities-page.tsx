import { useQuery } from "@tanstack/react-query"
import { LandmarkIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { legalEntityQueries, type LegalEntity } from "@/entities/legal-entity"
import { Can, useCan } from "@/entities/session"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatNumber } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import { LegalEntityDialog } from "../components/legal-entity-dialog"

export function LegalEntitiesPage() {
  const query = useQuery(legalEntityQueries.list())
  const canWrite = useCan("org:write")
  const [editing, setEditing] = useState<LegalEntity | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tüzel kişilikler"
        description="Şirketler grubundaki işveren ve yüklenici şirketler. Personel, sözleşme, puantaj ve bordro tüzel kişilik bazında ayrılır."
        actions={
          <Can permission="org:write">
            <Button
              onClick={() => {
                setCreating(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Yeni tüzel kişilik
            </Button>
          </Can>
        }
      />
      <Card>
        <CardContent>
          {query.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : query.isError ? (
            <ErrorState
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : query.data.length === 0 ? (
            <EmptyState
              icon={LandmarkIcon}
              title="Tüzel kişilik yok"
              description="Personel ekleyebilmek için en az bir tüzel kişilik tanımlayın."
            />
          ) : (
            <Table>
              <TableCaption className="sr-only">Tüzel kişilikler</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Unvan</TableHead>
                  <TableHead>VKN</TableHead>
                  <TableHead>Vergi dairesi</TableHead>
                  <TableHead>SGK sicil</TableHead>
                  <TableHead className="text-right">Personel</TableHead>
                  <TableHead>Durum</TableHead>
                  {canWrite ? (
                    <TableHead>
                      <span className="sr-only">İşlemler</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((entity) => (
                  <TableRow key={entity.id}>
                    <TableCell className="font-medium">
                      {entity.title}
                      {entity.eInvoiceEnabled ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          e-Fatura
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {entity.taxNumber}
                    </TableCell>
                    <TableCell>{entity.taxOffice}</TableCell>
                    <TableCell className="tabular-nums">
                      {entity.sgkWorkplaceNumbers.length}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(entity.personnelCount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={entity.isActive ? "success" : "neutral"}
                      >
                        {entity.isActive ? "Aktif" : "Pasif"}
                      </StatusBadge>
                    </TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${entity.title} düzenle`}
                          onClick={() => {
                            setEditing(entity)
                          }}
                        >
                          <PencilIcon />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <LegalEntityDialog
        open={creating || editing !== null}
        entity={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />
    </div>
  )
}
