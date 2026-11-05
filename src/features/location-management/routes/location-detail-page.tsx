import { useQuery } from "@tanstack/react-query"
import { PencilIcon, PlusIcon, PrinterIcon } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"
import { z } from "zod"

import {
  AREA_TYPE_LABELS,
  CERTIFICATE_LABELS,
  LOCATION_STATUS_LABELS,
  WEEKDAY_LABELS,
  locationQueries,
  type Area,
} from "@/entities/location"
import { Can, useCan } from "@/entities/session"
import { SERVICE_LINE_LABELS, useTerms } from "@/entities/tenant"
import { DetailList } from "@/shared/components/detail-list"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatNumber } from "@/shared/lib/format"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"

import { AreaDialog } from "../components/area-dialog"
import { TagsTab } from "../components/tags-tab"

const tabSchema = z.object({
  sekme: z.enum(["genel", "alanlar", "etiketler"]).catch("genel"),
})

export function LocationDetailPage() {
  const { locationId = "" } = useParams()
  const terms = useTerms()
  const [{ sekme }, setTab] = useSearchParamsState(tabSchema)
  const location = useQuery(locationQueries.detail(locationId))
  const areas = useQuery(locationQueries.areas(locationId))
  const canWrite = useCan("location:write")
  const [areaDialog, setAreaDialog] = useState<{ area: Area | null } | null>(
    null
  )

  if (location.isPending) return <PageSkeleton />
  if (location.isError)
    return (
      <ErrorState
        error={location.error}
        onRetry={() => void location.refetch()}
      />
    )
  const data = location.data
  const days = data.workingHours.days
    .map((day) => WEEKDAY_LABELS[day])
    .join(", ")
  const orgLabel = terms.orgLevels.at(-1)?.singular ?? "Bölge"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.name}
        description={`${data.code} · ${data.customerName}`}
        actions={
          <>
            <Link
              to={paths.tagPrint([data.id])}
              className={buttonVariants({ variant: "outline" })}
            >
              <PrinterIcon data-icon="inline-start" />
              Etiket bas
            </Link>
            <Can permission="location:write">
              <Link
                to={paths.locations.edit(data.id)}
                className={buttonVariants()}
              >
                <PencilIcon data-icon="inline-start" />
                Düzenle
              </Link>
            </Can>
          </>
        }
      />
      <Tabs
        value={sekme}
        onValueChange={(value) => {
          setTab({ sekme: value as typeof sekme })
        }}
      >
        <TabsList>
          <TabsTrigger value="genel">Genel</TabsTrigger>
          <TabsTrigger value="alanlar">
            {terms.area.plural} ({areas.data?.length ?? data.areaCount})
          </TabsTrigger>
          <TabsTrigger value="etiketler">QR ve NFC</TabsTrigger>
        </TabsList>
        <TabsContent value="genel" className="pt-4">
          <Card>
            <CardContent>
              <DetailList
                items={[
                  {
                    label: "Durum",
                    value: (
                      <StatusBadge
                        tone={data.status === "active" ? "success" : "neutral"}
                      >
                        {LOCATION_STATUS_LABELS[data.status]}
                      </StatusBadge>
                    ),
                  },
                  {
                    label: "Müşteri",
                    value: (
                      <Link
                        className="hover:underline"
                        to={paths.customers.detail(data.customerId)}
                      >
                        {data.customerName}
                      </Link>
                    ),
                  },
                  { label: orgLabel, value: data.orgUnitName },
                  {
                    label: "Hizmet hatları",
                    value: data.serviceLines
                      .map((line) => SERVICE_LINE_LABELS[line])
                      .join(", "),
                  },
                  {
                    label: "Adres",
                    value: `${data.address.line}, ${data.address.district} / ${data.address.city}`,
                  },
                  {
                    label: "Geofence",
                    value: `${formatNumber(data.geofence.center.lat, { maximumFractionDigits: 6 })}, ${formatNumber(data.geofence.center.lng, { maximumFractionDigits: 6 })} · ${data.geofence.radiusMeters} m`,
                  },
                  {
                    label: "Çalışma saatleri",
                    value: `${days} · ${data.workingHours.start}–${data.workingHours.end}`,
                  },
                  {
                    label: "Hedef kadro",
                    value: formatNumber(data.targetHeadcount),
                  },
                  {
                    label: "Gerekli sertifikalar",
                    value: data.requiredCertificates.length
                      ? data.requiredCertificates
                          .map((item) => CERTIFICATE_LABELS[item])
                          .join(", ")
                      : "Yok",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="alanlar" className="flex flex-col gap-4 pt-4">
          {canWrite ? (
            <div>
              <Button
                onClick={() => {
                  setAreaDialog({ area: null })
                }}
              >
                <PlusIcon data-icon="inline-start" />
                Yeni {terms.lower(terms.area)}
              </Button>
            </div>
          ) : null}
          <Card>
            <CardContent>
              {areas.isPending ? null : areas.isError ? (
                <ErrorState
                  error={areas.error}
                  onRetry={() => void areas.refetch()}
                />
              ) : areas.data.length === 0 ? (
                <EmptyState
                  title={`${terms.area.singular} tanımlı değil`}
                  description="QR bildirim ve denetim için alan tanımlayın."
                />
              ) : (
                <Table>
                  <TableCaption className="sr-only">
                    {terms.area.plural}
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ad</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead>Kat</TableHead>
                      <TableHead>QR</TableHead>
                      <TableHead>NFC</TableHead>
                      {canWrite ? (
                        <TableHead>
                          <span className="sr-only">İşlemler</span>
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {areas.data.map((area) => (
                      <TableRow key={area.id}>
                        <TableCell className="font-medium">
                          {area.name}
                        </TableCell>
                        <TableCell>{AREA_TYPE_LABELS[area.type]}</TableCell>
                        <TableCell>{area.floor ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {area.qrToken ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {area.nfcUid ?? "—"}
                        </TableCell>
                        {canWrite ? (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${area.name} düzenle`}
                              onClick={() => {
                                setAreaDialog({ area })
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
        </TabsContent>
        <TabsContent value="etiketler" className="pt-4">
          <TagsTab location={data} areas={areas.data ?? []} />
        </TabsContent>
      </Tabs>
      <AreaDialog
        open={areaDialog !== null}
        locationId={data.id}
        area={areaDialog?.area ?? null}
        onClose={() => {
          setAreaDialog(null)
        }}
      />
    </div>
  )
}
