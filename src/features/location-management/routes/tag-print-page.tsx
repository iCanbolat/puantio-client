import { useQuery } from "@tanstack/react-query"
import { ArrowLeftIcon, PrinterIcon } from "lucide-react"
import { Link, useSearchParams } from "react-router"

import { locationQueries } from "@/entities/location"
import { useTenant, useTerms } from "@/entities/tenant"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { QrCode } from "@/shared/components/qr-code"
import { paths } from "@/shared/config/paths"
import { Button, buttonVariants } from "@/shared/ui/button"

import { publicFeedbackUrl } from "../components/public-url"

/**
 * A4 toplu etiket baskısı: her etikette QR, lokasyon ve alan adı. Ekranda araç çubuğu,
 * baskıda yalnızca 3 sütunlu etiket ızgarası (print CSS).
 */
export function TagPrintPage() {
  const tenant = useTenant()
  const terms = useTerms()
  const [params] = useSearchParams()
  const ids = params.getAll("lokasyon")
  const query = useQuery({
    ...locationQueries.labels(ids),
    enabled: ids.length > 0,
  })

  const back =
    ids.length === 1 && ids[0]
      ? paths.locations.detail(ids[0], "etiketler")
      : paths.locations.list()

  return (
    <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 p-4 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link
          to={back}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Geri
        </Link>
        <h1 className="font-heading text-lg font-semibold">
          QR etiket baskısı
        </h1>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {query.data ? `${query.data.length} etiket` : null}
        </span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => {
            window.print()
          }}
          disabled={!query.data?.length}
        >
          <PrinterIcon data-icon="inline-start" />
          Yazdır
        </Button>
      </div>
      {ids.length === 0 ? (
        <EmptyState
          title={`${terms.location.singular} seçilmedi`}
          description="Listeden etiketini basmak istediğiniz kayıtları seçin."
        />
      ) : query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2"
          aria-label="Etiketler"
        >
          {query.data.map((label) => (
            <li
              key={label.token}
              className="flex break-inside-avoid flex-col items-center gap-2 rounded-xl border bg-white p-3 text-center text-black print:rounded-none"
            >
              <span className="text-[10px] font-semibold tracking-wide uppercase">
                {tenant.shortName}
              </span>
              <QrCode
                value={publicFeedbackUrl(label.token)}
                label={`${label.areaName ?? label.locationName} QR kodu`}
                size={112}
              />
              <span className="text-sm leading-tight font-semibold">
                {label.areaName ?? `${terms.location.singular} girişi`}
              </span>
              <span className="text-xs leading-tight">
                {label.locationName}
              </span>
              <span className="font-mono text-[10px]">
                {label.locationCode} · {label.token}
              </span>
              <span className="text-[10px]">Sorun bildirmek için okutun</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
