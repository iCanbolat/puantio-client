import { useMutation, useQuery } from "@tanstack/react-query"
import { DownloadIcon, PrinterIcon } from "lucide-react"
import { Link } from "react-router"

import { LocationCombobox } from "@/entities/location"
import { useTerms } from "@/entities/tenant"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { SimpleSelect } from "@/shared/components/simple-select"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Field, FieldLabel } from "@/shared/ui/field"
import { Skeleton } from "@/shared/ui/skeleton"
import { Spinner } from "@/shared/ui/spinner"

import { downloadAuditPack, ohsQueries } from "../api/ohs-api"
import { AuditPackView } from "../components/audit-pack-view"
import { auditPackParamsSchema } from "../model/ohs"

function PackBody({
  locationId,
  portal,
}: {
  locationId: string
  portal: boolean
}) {
  const query = useQuery(ohsQueries.auditPack(locationId, portal))
  const download = useMutation({
    mutationFn: () =>
      downloadAuditPack(locationId, {
        portal,
        ...(query.data ? { code: query.data.location.code } : {}),
      }),
    meta: { successMessage: "Denetim paketi indirildi" },
  })
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  if (!query.data) return <Skeleton className="h-64 w-full" />
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={download.isPending}
            onClick={() => {
              download.mutate()
            }}
          >
            {download.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            Excel indir
          </Button>
          <Link
            to={paths.print.auditPack(locationId, portal)}
            target="_blank"
            className={buttonVariants({ variant: "outline" })}
          >
            <PrinterIcon data-icon="inline-start" />
            Yazdır / PDF
          </Link>
        </div>
        <AuditPackView pack={query.data} />
      </CardContent>
    </Card>
  )
}

const DESCRIPTION =
  "Hastane ve havalimanı denetimleri için: lokasyonda çalışan personelin eğitim ve sertifika uygunluk listesi. Sağlık verisi pakete girmez; firma izin verdiyse yalnızca “Uygun” bilgisi gösterilir."

export function AuditPackPage() {
  const terms = useTerms()
  const [params, setParams] = useSearchParamsState(auditPackParamsSchema)
  // Adres çubuğundan gelen seçimde etiket paket yanıtından alınır (aynı önbellek kaydı)
  const pack = useQuery(ohsQueries.auditPack(params.lokasyon ?? ""))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Müşteri denetim paketi" description={DESCRIPTION} />
      <Field className="sm:max-w-md">
        <FieldLabel>{terms.location.singular}</FieldLabel>
        <LocationCombobox
          selectedLabel={
            pack.data
              ? `${pack.data.location.code} · ${pack.data.location.name}`
              : undefined
          }
          value={params.lokasyon ?? null}
          onValueChange={(lokasyon) => {
            setParams({ lokasyon: lokasyon ?? undefined })
          }}
        />
      </Field>
      {params.lokasyon ? (
        <PackBody locationId={params.lokasyon} portal={false} />
      ) : (
        <EmptyState
          title={`${terms.location.singular} seçin`}
          description="Paket, seçilen lokasyonun sertifika gereksinimine göre hazırlanır."
        />
      )}
    </div>
  )
}

export function PortalAuditPackPage() {
  const [params, setParams] = useSearchParamsState(auditPackParamsSchema)
  const locations = useQuery(ohsQueries.portalLocations())
  const options = (locations.data ?? []).map((item) => ({
    value: item.value,
    label: item.description
      ? `${item.label} (${item.description})`
      : item.label,
  }))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="İSG denetim paketi" description={DESCRIPTION} />
      <Field className="sm:max-w-md">
        <FieldLabel htmlFor="portal-pack-location">Hizmet noktası</FieldLabel>
        <SimpleSelect
          id="portal-pack-location"
          placeholder="Seçin"
          value={params.lokasyon ?? null}
          onChange={(lokasyon) => {
            setParams({ lokasyon })
          }}
          options={options}
        />
      </Field>
      {locations.isError ? (
        <ErrorState
          error={locations.error}
          onRetry={() => void locations.refetch()}
        />
      ) : params.lokasyon ? (
        <PackBody locationId={params.lokasyon} portal />
      ) : (
        <EmptyState
          title="Hizmet noktası seçin"
          description="Seçtiğiniz noktada çalışan personelin uygunluk listesi görüntülenir."
        />
      )}
    </div>
  )
}
