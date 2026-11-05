import { useMutation, useQuery } from "@tanstack/react-query"
import { NetworkIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import {
  buildOrgTree,
  deleteOrgUnit,
  orgUnitKeys,
  orgUnitQueries,
  type OrgTreeNode,
  type OrgUnit,
} from "@/entities/org-unit"
import { Can, useCan } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import { ConfirmDialog } from "@/shared/components/confirm-dialog"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatNumber } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"

import {
  OrgUnitDialog,
  type OrgUnitDialogState,
} from "../components/org-unit-dialog"

export function OrgUnitsPage() {
  const terms = useTerms()
  const query = useQuery(orgUnitQueries.list())
  const canWrite = useCan("org:write")
  const [dialog, setDialog] = useState<OrgUnitDialogState | null>(null)
  const [deleting, setDeleting] = useState<OrgUnit | null>(null)
  const remove = useMutation({
    mutationFn: (unit: OrgUnit) => deleteOrgUnit(unit.id),
    meta: { successMessage: "Birim silindi", invalidates: [orgUnitKeys.all] },
  })
  const levels = terms.orgLevels
  const root = levels[0] ?? { singular: "Bölge", plural: "Bölgeler" }
  const tree = buildOrgTree(query.data ?? [])

  const renderNode = (node: OrgTreeNode) => {
    const childTerm = levels[node.level + 1]
    return (
      <li key={node.id} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2">
          <span className="font-mono text-xs text-muted-foreground">
            {node.code}
          </span>
          <span className="font-medium">{node.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatNumber(node.locationCount)} {terms.lower(terms.location)}
          </span>
          {!node.isActive ? (
            <StatusBadge tone="neutral">Pasif</StatusBadge>
          ) : null}
          {canWrite ? (
            <span className="ml-auto flex gap-1">
              {childTerm ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDialog({
                      unit: null,
                      level: node.level + 1,
                      parent: node,
                    })
                  }}
                >
                  <PlusIcon data-icon="inline-start" />
                  {childTerm.singular} ekle
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${node.name} düzenle`}
                onClick={() => {
                  setDialog({ unit: node, level: node.level, parent: null })
                }}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${node.name} sil`}
                onClick={() => {
                  setDeleting(node)
                }}
              >
                <Trash2Icon />
              </Button>
            </span>
          ) : null}
        </div>
        {node.children.length > 0 ? (
          <ul
            className="flex flex-col gap-2 border-l pl-4 sm:pl-6"
            aria-label={`${node.name} alt birimleri`}
          >
            {node.children.map(renderNode)}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={levels.map((level) => level.plural).join(" ve ")}
        description={`Organizasyon hiyerarşisi: ${[...levels.map((level) => level.singular), terms.location.singular, terms.area.singular].join(" → ")}. Kullanıcı kapsamları bu birimlere göre atanır.`}
        actions={
          <Can permission="org:write">
            <Button
              onClick={() => {
                setDialog({ unit: null, level: 0, parent: null })
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Yeni {terms.lower(root)}
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
          ) : tree.length === 0 ? (
            <EmptyState
              icon={NetworkIcon}
              title={`${root.singular} tanımlı değil`}
            />
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Organizasyon ağacı">
              {tree.map(renderNode)}
            </ul>
          )}
        </CardContent>
      </Card>
      <OrgUnitDialog
        state={dialog}
        onClose={() => {
          setDialog(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Birim silinsin mi?"
        description={
          deleting
            ? `${deleting.code} · ${deleting.name} silinecek.`
            : undefined
        }
        confirmLabel="Sil"
        destructive
        onConfirm={() => (deleting ? remove.mutateAsync(deleting) : undefined)}
      />
    </div>
  )
}
