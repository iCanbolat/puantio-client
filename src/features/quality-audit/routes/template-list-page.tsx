import { useMutation, useQuery } from "@tanstack/react-query"
import { ClipboardListIcon, CopyIcon, LockIcon, PlusIcon } from "lucide-react"
import { Link, useNavigate } from "react-router"

import { CUSTOMER_SECTOR_LABELS } from "@/entities/customer"
import { Can, useCan } from "@/entities/session"
import { SERVICE_LINE_LABELS, useTenant } from "@/entities/tenant"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { Button, buttonVariants } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"

import { createTemplate, qualityKeys, qualityQueries } from "../api/quality-api"
import type { AuditTemplate } from "../model/audit"
import { toTemplateInput } from "../lib/format"

export function TemplateListPage() {
  const query = useQuery(qualityQueries.templates())
  const canWrite = useCan("quality:write")
  const tenant = useTenant()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (template: AuditTemplate | null) =>
      createTemplate(
        template
          ? { ...toTemplateInput(template), name: `${template.name} (kopya)` }
          : {
              name: "Yeni denetim şablonu",
              description: null,
              serviceLine: tenant.serviceLines[0] ?? "cleaning",
              sectors: [],
              isActive: true,
              sections: [
                {
                  id: `s-${crypto.randomUUID().slice(0, 8)}`,
                  title: "Genel",
                  items: [
                    {
                      id: `m-${crypto.randomUUID().slice(0, 8)}`,
                      text: "Alan temiz ve düzenli",
                      type: "yes_no",
                      weight: 100,
                      critical: false,
                      workOrderPriority: "normal",
                    },
                  ],
                },
              ],
            }
      ),
    meta: {
      successMessage: "Şablon oluşturuldu",
      invalidates: [qualityKeys.templates()],
    },
    onSuccess: (created) => {
      void navigate(paths.quality.template(created.id))
    },
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Denetim şablonları"
        description="Hizmet hattı ve müşteri sektörüne göre kontrol listeleri. Hazır şablonlar platform kütüphanesinden gelir; çoğaltıp firmanıza uyarlayın. Doldurma saha uygulamasında yapılır."
        actions={
          <Can permission="quality:write">
            <Button
              disabled={create.isPending}
              onClick={() => {
                create.mutate(null)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Yeni şablon
            </Button>
          </Can>
        }
      />
      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} title="Şablon yok" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {query.data.map((template) => (
            <li key={template.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-2">
                    <Link
                      to={paths.quality.template(template.id)}
                      className="hover:underline"
                    >
                      {template.name}
                    </Link>
                    {template.builtIn ? (
                      <StatusBadge tone="info">
                        <LockIcon className="size-3" aria-hidden />
                        Hazır
                      </StatusBadge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 text-xs">
                  <StatusBadge tone="neutral">
                    {SERVICE_LINE_LABELS[template.serviceLine]}
                  </StatusBadge>
                  {template.sectors.map((sector) => (
                    <StatusBadge key={sector} tone="neutral">
                      {CUSTOMER_SECTOR_LABELS[sector]}
                    </StatusBadge>
                  ))}
                  <span className="text-muted-foreground">
                    Sürüm {template.version} ·{" "}
                    {template.sections.reduce(
                      (sum, section) => sum + section.items.length,
                      0
                    )}{" "}
                    madde · {template.auditCount} denetim
                  </span>
                  {!template.isActive ? (
                    <StatusBadge tone="neutral">Pasif</StatusBadge>
                  ) : null}
                </CardContent>
                <CardFooter className="gap-2">
                  <Link
                    to={paths.quality.template(template.id)}
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                    aria-label={`${template.name} şablonunu ${template.builtIn || !canWrite ? "incele" : "düzenle"}`}
                  >
                    {template.builtIn || !canWrite ? "İncele" : "Düzenle"}
                  </Link>
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${template.name} şablonunu çoğalt`}
                      disabled={create.isPending}
                      onClick={() => {
                        create.mutate(template)
                      }}
                    >
                      <CopyIcon data-icon="inline-start" />
                      Çoğalt
                    </Button>
                  ) : null}
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
