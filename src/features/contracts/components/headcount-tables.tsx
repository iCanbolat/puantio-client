import type { ReactNode } from "react"

import { ProgressBar } from "@/shared/components/progress-bar"
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

import { headcountGap } from "../domain/headcount"
import type { HeadcountReport, HeadcountRow } from "../model/contract"

const number = (value: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)
const percent = (ratio: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio)

export function GapCell({
  committed,
  actual,
}: {
  committed: number
  actual: number
}) {
  const gap = headcountGap(committed, actual)
  const sign = gap.difference < 0 ? "−" : gap.difference > 0 ? "+" : "±"
  return (
    <span
      className={cn(
        "tabular-nums",
        gap.difference < 0 && "font-medium text-destructive"
      )}
    >
      {sign}
      {number(Math.abs(gap.difference))} ({percent(gap.ratio)})
    </span>
  )
}

export function RegionTable({ report }: { report: HeadcountReport }) {
  return (
    <div className="rounded-lg border">
      <Table scrollLabel="Bölge tablosu">
        <caption className="sr-only">
          Bölge bazında taahhüt ve fiili kadro
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead>Bölge</TableHead>
            <TableHead className="text-right">Taahhüt</TableHead>
            <TableHead className="text-right">Fiili</TableHead>
            <TableHead className="text-right">Fark</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.regions.map((region) => (
            <TableRow key={region.orgUnitId}>
              <TableCell>{region.orgUnitName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {number(region.committed)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {number(region.actual)}
              </TableCell>
              <TableCell className="text-right">
                <GapCell committed={region.committed} actual={region.actual} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function LocationTable({
  report,
  action,
  caption = "Lokasyon bazında taahhüt ve fiili kadro",
}: {
  report: HeadcountReport
  action?: (row: HeadcountRow) => ReactNode
  caption?: string
}) {
  return (
    <div className="rounded-lg border">
      <Table scrollLabel={`${caption} tablosu`}>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Lokasyon</TableHead>
            <TableHead>Sözleşme</TableHead>
            <TableHead>Bölge</TableHead>
            <TableHead className="text-right">Planlı gün</TableHead>
            <TableHead className="text-right">Taahhüt</TableHead>
            <TableHead className="text-right">Fiili</TableHead>
            <TableHead className="text-right">Fark</TableHead>
            <TableHead className="min-w-28 print:hidden">Doluluk</TableHead>
            {action ? (
              <TableHead className="print:hidden">
                <span className="sr-only">İşlem</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.rows.map((row) => (
            <TableRow key={`${row.contractId}|${row.locationId}`}>
              <TableCell className="font-medium">{row.locationName}</TableCell>
              <TableCell>
                <span className="flex flex-col">
                  <span className="font-mono text-xs">{row.contractCode}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.customerName}
                  </span>
                </span>
              </TableCell>
              <TableCell>{row.orgUnitName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.plannedDays}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {number(row.committed)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {number(row.actual)}
              </TableCell>
              <TableCell className="text-right">
                <GapCell committed={row.committed} actual={row.actual} />
              </TableCell>
              <TableCell className="print:hidden">
                <ProgressBar
                  label={`${row.locationName} kadro doluluğu`}
                  value={Math.min(row.actual, row.committed)}
                  max={row.committed}
                />
              </TableCell>
              {action ? (
                <TableCell className="print:hidden">{action(row)}</TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4}>Toplam</TableCell>
            <TableCell className="text-right tabular-nums">
              {number(report.totals.committed)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {number(report.totals.actual)}
            </TableCell>
            <TableCell className="text-right">
              <GapCell
                committed={report.totals.committed}
                actual={report.totals.actual}
              />
            </TableCell>
            <TableCell className="print:hidden" colSpan={action ? 2 : 1} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
