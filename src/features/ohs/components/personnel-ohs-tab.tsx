import { useQuery } from "@tanstack/react-query"
import { FileTextIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { CERTIFICATE_LABELS } from "@/entities/location"
import { Can, useCan } from "@/entities/session"
import { HAZARD_CLASS_LABELS } from "@/entities/tenant"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { StatusBadge } from "@/shared/components/status-badge"
import { formatDate } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import { ohsQueries } from "../api/ohs-api"
import { CertificateDialog, type CertificatePreset } from "./certificate-dialog"
import { BucketBadge, ComplianceBadge, TrainingStateBadge } from "./ohs-badges"

/** Personel kartı "İSG" sekmesi: gereksinim uygunluğu, eğitimler, sertifikalar */
export function PersonnelOhsTab({
  personnelId,
  personnelName,
}: {
  personnelId: string
  personnelName: string
}) {
  const query = useQuery(ohsQueries.personnel(personnelId))
  const canWrite = useCan("ohs:write")
  const [preset, setPreset] = useState<CertificatePreset | null>(null)
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  if (!query.data) return <Skeleton className="h-48 w-full" />
  const data = query.data
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Lokasyon gereksinimleri</CardTitle>
          <CardDescription>
            {data.locationName ?? "Ana lokasyon yok"} · Tehlike sınıfı:{" "}
            {HAZARD_CLASS_LABELS[data.hazardClass]}
            {data.hazardClassSource === "tenant" ? " (firma varsayılanı)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ana lokasyonda zorunlu sertifika yok.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.requirements.map((item) => (
                <li
                  key={item.type}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {CERTIFICATE_LABELS[item.type]}
                    {item.expiresAt ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatDate(item.expiresAt)}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <ComplianceBadge state={item.state} />
                    {canWrite && item.state !== "valid" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPreset({
                            personnelId,
                            personnelName,
                            type: item.type,
                          })
                        }}
                      >
                        {item.state === "missing" ? "Ekle" : "Yenile"}
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Eğitimler</CardTitle>
        </CardHeader>
        <CardContent>
          {data.trainings.length === 0 ? (
            <EmptyState title="Zorunlu eğitim yok" />
          ) : (
            <Table scrollLabel="Eğitim durumu tablosu">
              <TableHeader>
                <TableRow>
                  <TableHead>Eğitim</TableHead>
                  <TableHead>Son eğitim</TableHead>
                  <TableHead>Yenileme</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.trainings.map((item) => (
                  <TableRow key={item.typeId}>
                    <TableCell>{item.typeName}</TableCell>
                    <TableCell>
                      {item.lastCompletedAt
                        ? formatDate(item.lastCompletedAt)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {item.dueAt ? formatDate(item.dueAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <TrainingStateBadge state={item.state} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Sertifikalar</CardTitle>
          <Can permission="ohs:write">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPreset({ personnelId, personnelName })
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Sertifika ekle
            </Button>
          </Can>
        </CardHeader>
        <CardContent>
          {data.certificates.length === 0 ? (
            <EmptyState title="Kayıtlı sertifika yok" />
          ) : (
            <ul className="flex flex-col divide-y">
              {data.certificates.map((cert) => (
                <li
                  key={cert.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="flex flex-col">
                    <span>{CERTIFICATE_LABELS[cert.type]}</span>
                    <span className="text-xs text-muted-foreground">
                      {cert.number} · {formatDate(cert.issuedAt)} –{" "}
                      {cert.expiresAt ? formatDate(cert.expiresAt) : "süresiz"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {cert.superseded ? (
                      <StatusBadge tone="neutral">Yenilendi</StatusBadge>
                    ) : (
                      <BucketBadge bucket={cert.bucket} />
                    )}
                    {cert.documentUrl ? (
                      <a
                        href={cert.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
                        aria-label={`${CERTIFICATE_LABELS[cert.type]} belgesini aç`}
                      >
                        <FileTextIcon className="size-4" />
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <CertificateDialog
        preset={preset}
        onClose={() => {
          setPreset(null)
        }}
      />
    </div>
  )
}
