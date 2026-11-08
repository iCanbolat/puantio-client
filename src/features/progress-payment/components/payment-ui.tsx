import { CheckIcon } from "lucide-react"

import { StatusBadge } from "@/shared/components/status-badge"
import { formatDate, formatMoney } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import { PAYMENT_STEPS } from "../domain/status"
import {
  LINE_KIND_LABELS,
  PROGRESS_PAYMENT_STATUS_LABELS,
  PROGRESS_PAYMENT_STATUS_TONES,
  type Calculation,
  type ProgressPaymentStatus,
} from "../model/progress-payment"

export function PaymentStatusBadge({
  status,
}: {
  status: ProgressPaymentStatus
}) {
  return (
    <StatusBadge tone={PROGRESS_PAYMENT_STATUS_TONES[status]}>
      {PROGRESS_PAYMENT_STATUS_LABELS[status]}
    </StatusBadge>
  )
}

export function PaymentStepper({ status }: { status: ProgressPaymentStatus }) {
  const current = PAYMENT_STEPS.indexOf(status)
  return (
    <ol
      className="flex flex-wrap items-center gap-2 text-xs"
      aria-label="Hakediş adımları"
    >
      {PAYMENT_STEPS.map((step, index) => {
        const done = index < current
        const active = index === current
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
              done && "border-primary/40 bg-primary/10 text-primary",
              active &&
                "border-primary bg-primary font-medium text-primary-foreground",
              !done && !active && "text-muted-foreground"
            )}
          >
            {done ? (
              <CheckIcon className="size-3" aria-hidden />
            ) : (
              <span className="tabular-nums">{index + 1}</span>
            )}
            {PROGRESS_PAYMENT_STATUS_LABELS[step]}
          </li>
        )
      })}
    </ol>
  )
}

const quantity = (value: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)

const range = (from: string | null, to: string | null) =>
  from && to
    ? `${formatDate(from).slice(0, 5)}–${formatDate(to).slice(0, 5)}`
    : "—"

/** Hakediş kalemleri (ekran ve baskı ortak) */
export function CalculationTable({
  calculation,
}: {
  calculation: Calculation
}) {
  const { lines, totals } = calculation
  return (
    <div className="rounded-lg border">
      <Table scrollLabel="Hakediş kalemleri tablosu">
        <caption className="sr-only">Hakediş kalemleri</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Kalem</TableHead>
            <TableHead>Açıklama</TableHead>
            <TableHead>Dönem</TableHead>
            <TableHead className="text-right">Miktar</TableHead>
            <TableHead className="text-right">Birim fiyat</TableHead>
            <TableHead className="text-right">Tutar</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.key}>
              <TableCell className="whitespace-nowrap">
                {LINE_KIND_LABELS[line.kind]}
              </TableCell>
              <TableCell>{line.label}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {range(line.from, line.to)}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {quantity(line.quantity)} {line.unit}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {line.unitPrice === null ? "—" : formatMoney(line.unitPrice)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  line.amount < 0 && "text-destructive"
                )}
              >
                {formatMoney(line.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5}>Ara toplam</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(totals.subtotal)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={5}>KDV (%{totals.vatRate})</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(totals.vat)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={5} className="font-semibold">
              Genel toplam
            </TableCell>
            <TableCell
              className="text-right font-semibold tabular-nums"
              data-testid="payment-total"
            >
              {formatMoney(totals.total)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
