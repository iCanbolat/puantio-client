import { useMutation, useQuery } from "@tanstack/react-query"
import { DownloadIcon, PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"

import { CONTRACT_TYPE_LABELS } from "@/entities/contract"
import {
  contractDetailQueries,
  latestVersion,
  monthTitle,
  versionAt,
} from "@/features/contracts"
import { Can } from "@/entities/session"
import { DetailList } from "@/shared/components/detail-list"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatCard } from "@/shared/components/stat-card"
import { paths } from "@/shared/config/paths"
import { formatDateTime, formatMoney } from "@/shared/lib/format"
import { monthRange } from "@/shared/lib/work-time"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"

import {
  downloadProgressPayment,
  progressPaymentKeys,
  progressPaymentQueries,
  updatePenalties,
} from "../api/progress-payment-api"
import { PenaltyDialog, TransitionDialog } from "../components/payment-dialogs"
import {
  CalculationTable,
  PaymentStatusBadge,
  PaymentStepper,
} from "../components/payment-ui"
import { StalePanel } from "../components/stale-panel"
import { isPaymentEditable } from "../domain/status"
import {
  PROGRESS_PAYMENT_ACTION_LABELS,
  type ProgressPaymentAction,
} from "../model/progress-payment"

const days = (value: number) =>
  `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)} kişi-gün`

export function PaymentDetailPage() {
  const { paymentId = "" } = useParams()
  const query = useQuery(progressPaymentQueries.detail(paymentId))
  const contractId = query.data?.contractId ?? ""
  const contract = useQuery({
    ...contractDetailQueries.detail(contractId),
    enabled: contractId !== "",
  })
  const [action, setAction] = useState<ProgressPaymentAction | null>(null)
  const [addingPenalty, setAddingPenalty] = useState(false)
  const removePenalty = useMutation({
    mutationFn: (index: number) =>
      updatePenalties(
        paymentId,
        (query.data?.penalties ?? []).filter((_, i) => i !== index)
      ),
    meta: {
      successMessage: "Ceza kaldırıldı",
      invalidates: [progressPaymentKeys.all],
    },
  })
  const download = useMutation({
    mutationFn: () =>
      downloadProgressPayment(
        paymentId,
        `hakedis-${query.data?.number ?? ""}.xlsx`
      ),
    meta: { errorMessage: "Dosya indirilemedi" },
  })

  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  const payment = query.data
  const { totals, stats } = payment.calculation
  const editable = isPaymentEditable(payment.status)
  const rules = contract.data
    ? (
        versionAt(contract.data.versions, monthRange(payment.month).to) ??
        latestVersion(contract.data.versions)
      ).rules.penalties
    : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Hakediş ${payment.number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="capitalize">{monthTitle(payment.month)}</span>·
            <Link
              to={paths.contracts.detail(payment.contractId)}
              className="hover:underline"
            >
              {payment.contractCode} {payment.contractTitle}
            </Link>
            <PaymentStatusBadge status={payment.status} />
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={download.isPending}
              onClick={() => {
                download.mutate()
              }}
            >
              <DownloadIcon data-icon="inline-start" />
              Excel indir
            </Button>
            <Link
              to={paths.print.progressPayment(payment.id)}
              target="_blank"
              className={buttonVariants({ variant: "outline" })}
            >
              <PrinterIcon data-icon="inline-start" />
              Baskı düzeni
            </Link>
            {payment.availableActions.map((item) => (
              <Button
                key={item}
                variant={item === "return_to_draft" ? "outline" : "default"}
                onClick={() => {
                  setAction(item)
                }}
              >
                {PROGRESS_PAYMENT_ACTION_LABELS[item]}
              </Button>
            ))}
          </>
        }
      />
      <PaymentStepper status={payment.status} />
      {payment.isStale ? <StalePanel paymentId={payment.id} /> : null}
      {editable && !payment.timesheetApproved ? (
        <Alert>
          <AlertTitle>Puantaj onaylanmadı</AlertTitle>
          <AlertDescription>
            Dönemin puantajı İK onayı almadan hakediş kontrole gönderilemez.
            Taslak, puantaj değiştikçe yeniden hesaplanabilir.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="İşçilik (taahhüt)" value={formatMoney(totals.labor)} />
        <StatCard
          label="Eksik personel kesintisi"
          value={formatMoney(totals.deductions)}
          tone={totals.deductions < 0 ? "warning" : "default"}
          hint={days(stats.shortfallPersonDays)}
        />
        <StatCard
          label="Fiyat farkı"
          value={formatMoney(totals.priceAdjustment)}
        />
        <StatCard
          label="Genel toplam (KDV dahil)"
          value={formatMoney(totals.total)}
          tone="success"
        />
      </div>
      <Card>
        <CardContent>
          <DetailList
            items={[
              { label: "Müşteri", value: payment.customerName },
              {
                label: "Sözleşme tipi",
                value: CONTRACT_TYPE_LABELS[payment.contractType],
              },
              { label: "Taahhüt", value: days(stats.committedPersonDays) },
              {
                label: "Çalışılan (taahhüt içi)",
                value: days(stats.workedPersonDays),
              },
              {
                label: "Taahhüt üstü (ödenmez)",
                value: days(stats.excessPersonDays),
              },
              {
                label: "Fazla mesai",
                value: `${new Intl.NumberFormat("tr-TR").format(stats.overtimeHours)} saat`,
              },
              {
                label: "Hesaplama",
                value: formatDateTime(payment.calculatedAt),
              },
              { label: "Fatura no", value: payment.invoiceNumber },
            ]}
          />
        </CardContent>
      </Card>
      <section aria-labelledby="lines" className="flex flex-col gap-3">
        <h2 id="lines" className="font-heading text-lg font-medium">
          Hakediş kalemleri
        </h2>
        <CalculationTable calculation={payment.calculation} />
      </section>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            <h2>Cezalar</h2>
          </CardTitle>
          {editable && rules.length > 0 ? (
            <Can permission="progress_payment:approve">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddingPenalty(true)
                }}
              >
                <PlusIcon data-icon="inline-start" />
                Ceza ekle
              </Button>
            </Can>
          ) : null}
        </CardHeader>
        <CardContent>
          {payment.penalties.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ceza yok.</p>
          ) : (
            <ul className="divide-y text-sm" aria-label="Ceza kalemleri">
              {payment.penalties.map((penalty, index) => (
                <li key={index} className="flex items-center gap-2 py-2">
                  <span className="flex-1">
                    {penalty.label} × {penalty.quantity}
                    {penalty.note ? ` · ${penalty.note}` : ""}
                  </span>
                  {editable ? (
                    <Can permission="progress_payment:approve">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${penalty.label} cezasını kaldır`}
                        onClick={() => {
                          removePenalty.mutate(index)
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </Can>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Geçmiş</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol
            className="flex flex-col gap-2 text-sm"
            aria-label="Hakediş geçmişi"
          >
            {payment.history.map((entry, index) => (
              <li key={index}>
                <span className="text-muted-foreground tabular-nums">
                  {formatDateTime(entry.at)}
                </span>{" "}
                · {entry.actor} · {entry.action}
                {entry.note ? ` — ${entry.note}` : ""}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <TransitionDialog
        payment={payment}
        action={action}
        onClose={() => {
          setAction(null)
        }}
      />
      <PenaltyDialog
        payment={payment}
        rules={rules}
        open={addingPenalty}
        onClose={() => {
          setAddingPenalty(false)
        }}
      />
    </div>
  )
}
