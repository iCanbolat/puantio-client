import { useMutation, useQuery } from "@tanstack/react-query"
import { PencilIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { Can, useCan } from "@/entities/session"
import {
  SHIFT_TEMPLATE_KIND_LABELS,
  setShiftTemplateActive,
  shiftKeys,
  shiftQueries,
  templateNetMinutes,
  templateTimeLabel,
  type ShiftTemplate,
} from "@/entities/shift"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { StatusBadge } from "@/shared/components/status-badge"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { Checkbox } from "@/shared/ui/checkbox"

import { LocationRulesCard } from "../components/location-rules-card"
import { SHIFT_COLOR_CLASSES } from "../components/shift-colors"
import { TemplateDialog } from "../components/template-dialog"

export function TemplatesPage() {
  const query = useQuery(shiftQueries.templates())
  const canWrite = useCan("schedule:write")
  const [editing, setEditing] = useState<ShiftTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      setShiftTemplateActive(input.id, input.isActive),
    meta: { invalidates: [shiftKeys.all] },
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vardiya şablonları"
        description="Sabah, akşam, gece, parçalı ve 12 saatlik rotasyon şablonları. Pasif şablon panoda görünmez."
        actions={
          <Can permission="schedule:write">
            <Button
              onClick={() => {
                setCreating(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Yeni şablon
            </Button>
          </Can>
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ul
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="Şablon listesi"
        >
          {query.data.items.map((template) => (
            <li
              key={template.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "rounded-lg px-2 py-1 font-mono text-sm font-semibold ring-1",
                    SHIFT_COLOR_CLASSES[template.color]
                  )}
                >
                  {template.code}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{template.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {SHIFT_TEMPLATE_KIND_LABELS[template.kind]}
                    {template.kind === "rotation"
                      ? ` · ${template.rotation?.length ?? 0} günlük döngü`
                      : ` · ${templateTimeLabel(template)} · mola ${template.breakMinutes} dk · net ${(templateNetMinutes(template) / 60).toLocaleString("tr-TR")} sa`}
                  </span>
                </div>
                {template.isActive ? null : (
                  <StatusBadge tone="neutral">Pasif</StatusBadge>
                )}
              </div>
              {canWrite ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`tpl-active-${template.id}`}
                    checked={template.isActive}
                    onCheckedChange={(checked) => {
                      toggle.mutate({ id: template.id, isActive: checked })
                    }}
                  />
                  <label
                    htmlFor={`tpl-active-${template.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    Aktif
                  </label>
                  {template.kind === "rotation" ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        setEditing(template)
                      }}
                      aria-label={`${template.name} şablonunu düzenle`}
                    >
                      <PencilIcon data-icon="inline-start" />
                      Düzenle
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <LocationRulesCard />
      <TemplateDialog
        open={creating || editing !== null}
        template={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />
    </div>
  )
}
