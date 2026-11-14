import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangleIcon,
  BadgeAlertIcon,
  CalendarClockIcon,
  GraduationCapIcon,
  HeartPulseIcon,
} from "lucide-react"
import { Link } from "react-router"

import { EXPIRY_BUCKETS, EXPIRY_BUCKET_LABELS } from "@/entities/ohs"
import { Can } from "@/entities/session"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { StatCard } from "@/shared/components/stat-card"
import { paths } from "@/shared/config/paths"
import { formatDate, formatNumber } from "@/shared/lib/format"
import { buttonVariants } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"

import { ohsQueries } from "../api/ohs-api"

export function OhsOverviewPage() {
  const query = useQuery(ohsQueries.overview())
  const data = query.data
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="İSG ve özlük"
        description="Sertifika süreleri, eğitim yenilemeleri ve periyodik muayeneler. Süresi dolan sertifika vardiya planlamasında uyarı veya engel üretir."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={paths.ohs.auditPack()}
              className={buttonVariants({ variant: "outline" })}
            >
              Müşteri denetim paketi
            </Link>
          </div>
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <section
            aria-labelledby="ohs-cert-heading"
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="ohs-cert-heading" className="text-lg font-semibold">
                Sertifika uyarı kovaları
              </h2>
              <Link
                to={paths.ohs.certificates()}
                className={buttonVariants({ variant: "link", size: "sm" })}
              >
                Tüm sertifikalar
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {EXPIRY_BUCKETS.map((bucket) => (
                <Link
                  key={bucket}
                  to={paths.ohs.certificates({ bucket })}
                  className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <StatCard
                    label={EXPIRY_BUCKET_LABELS[bucket]}
                    value={formatNumber(data?.certificateBuckets[bucket] ?? 0)}
                    icon={
                      bucket === "expired" ? BadgeAlertIcon : CalendarClockIcon
                    }
                    tone={
                      bucket === "expired"
                        ? "danger"
                        : bucket === "d30"
                          ? "warning"
                          : "default"
                    }
                    isLoading={query.isPending}
                    className="h-full"
                  />
                </Link>
              ))}
              <StatCard
                label="Zorunlu sertifikası eksik personel"
                value={formatNumber(data?.missingCertificates ?? 0)}
                icon={AlertTriangleIcon}
                tone={data?.missingCertificates ? "danger" : "default"}
                isLoading={query.isPending}
              />
            </div>
          </section>
          <section
            aria-labelledby="ohs-training-heading"
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="ohs-training-heading" className="text-lg font-semibold">
                Eğitimler
              </h2>
              <Link
                to={paths.ohs.trainings()}
                className={buttonVariants({ variant: "link", size: "sm" })}
              >
                Eğitim durumu
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Gecikmiş eğitim"
                value={formatNumber(data?.trainings.overdue ?? 0)}
                icon={GraduationCapIcon}
                tone={data?.trainings.overdue ? "danger" : "default"}
                isLoading={query.isPending}
              />
              <StatCard
                label="Hiç almamış"
                value={formatNumber(data?.trainings.never ?? 0)}
                icon={GraduationCapIcon}
                tone={data?.trainings.never ? "warning" : "default"}
                isLoading={query.isPending}
              />
              <StatCard
                label="30 gün içinde yenilenecek"
                value={formatNumber(data?.trainings.expiring ?? 0)}
                icon={CalendarClockIcon}
                isLoading={query.isPending}
              />
            </div>
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Yaklaşan eğitimler</CardTitle>
              </CardHeader>
              <CardContent>
                {data && data.upcomingSessions.length === 0 ? (
                  <EmptyState
                    title="Planlanmış eğitim yok"
                    description="Eğitimler sayfasından toplu eğitim planlayabilirsiniz."
                  />
                ) : (
                  <ul className="flex flex-col divide-y">
                    {data?.upcomingSessions.map((session) => (
                      <li
                        key={session.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span className="flex flex-col">
                          <span className="font-medium">
                            {session.typeName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {session.number} · {session.participantCount}{" "}
                            katılımcı
                          </span>
                        </span>
                        <span>{formatDate(session.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Can permission="health:read">
              {data?.health ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Periyodik muayeneler</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <StatCard
                      label="Muayenesi gecikmiş"
                      value={formatNumber(data.health.overdue)}
                      icon={HeartPulseIcon}
                      tone={data.health.overdue ? "danger" : "default"}
                    />
                    <StatCard
                      label="30 gün içinde"
                      value={formatNumber(data.health.dueIn30)}
                      icon={HeartPulseIcon}
                    />
                    <Link
                      to={paths.ohs.health()}
                      className={buttonVariants({
                        variant: "outline",
                        className: "sm:col-span-2",
                      })}
                    >
                      Sağlık gözetimi
                    </Link>
                  </CardContent>
                </Card>
              ) : null}
            </Can>
          </div>
        </>
      )}
    </div>
  )
}
