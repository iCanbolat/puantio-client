import { useMutation, useQuery } from "@tanstack/react-query"
import { DownloadIcon, FileSpreadsheetIcon, Settings2Icon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { legalEntityQueries } from "@/entities/legal-entity"
import { Can } from "@/entities/session"
import { monthLabel, timesheetQueries } from "@/features/timesheet"
import { getErrorMessage } from "@/shared/api/errors"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { SimpleSelect } from "@/shared/components/simple-select"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDateTime } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { Button, buttonVariants } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Field, FieldLabel } from "@/shared/ui/field"
import { Skeleton } from "@/shared/ui/skeleton"
import { Spinner } from "@/shared/ui/spinner"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import {
  createPayrollExport,
  downloadPayrollExport,
  payrollKeys,
  payrollQueries,
} from "../api/payroll-api"
import { formatPayrollValue } from "../domain/build-table"
import {
  PAYROLL_ENCODING_LABELS,
  PAYROLL_FORMAT_LABELS,
} from "../model/profile"

const paramsSchema = z.object({
  donem: z.string().min(1).optional().catch(undefined),
  profil: z.string().min(1).optional().catch(undefined),
})

export function ExportsPage() {
  const [params, setParams] = useSearchParamsState(paramsSchema)
  const periods = useQuery(timesheetQueries.periods())
  const profiles = useQuery(payrollQueries.profiles())
  const entities = useQuery(legalEntityQueries.list())
  const history = useQuery(payrollQueries.exports())
  const eligible = (periods.data?.items ?? []).filter(
    (period) => period.status === "hr_approved" || period.status === "locked"
  )
  const period = eligible.find((item) => item.id === params.donem) ?? null
  const entity = entities.data?.find(
    (item) => item.id === period?.legalEntityId
  )
  const profileId =
    params.profil ??
    entity?.payrollProfileId ??
    profiles.data?.items[0]?.id ??
    null
  const profile =
    profiles.data?.items.find((item) => item.id === profileId) ?? null
  const preview = useQuery({
    ...payrollQueries.preview({
      periodId: period?.id ?? "",
      profileId: profileId ?? "",
    }),
    enabled: Boolean(period && profileId),
  })
  const [downloading, setDownloading] = useState<string | null>(null)
  const exporter = useMutation({
    mutationFn: async () => {
      if (!period || !profileId) throw new Error("Dönem ve profil seçin")
      const record = await createPayrollExport({
        periodId: period.id,
        profileId,
      })
      await downloadPayrollExport(record.id, record.fileName)
      return record
    },
    meta: { invalidates: [payrollKeys.all] },
    onSuccess: (record) => {
      toast.success(`${record.fileName} indirildi (${record.rowCount} satır)`)
    },
  })
  const download = async (id: string, name: string) => {
    setDownloading(id)
    try {
      await downloadPayrollExport(id, name)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setDownloading(null)
    }
  }
  const errorRows = preview.data?.errorRows ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bordro aktarımı"
        description="İK onaylı veya kilitli puantaj dönemini seçilen bordro profiline göre dosyaya aktarır. Gün toplamı tutmayan satır varsa dışa aktarım engellenir."
        actions={
          <Can permission="payroll:profiles">
            <Link
              to={paths.payroll.profiles()}
              className={buttonVariants({ variant: "outline" })}
            >
              <Settings2Icon data-icon="inline-start" />
              Aktarım profilleri
            </Link>
          </Can>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
        <Field>
          <FieldLabel htmlFor="payroll-period">Puantaj dönemi</FieldLabel>
          <SimpleSelect
            id="payroll-period"
            value={period?.id ?? null}
            placeholder={
              eligible.length === 0 ? "Onaylı dönem yok" : "Dönem seçin"
            }
            disabled={eligible.length === 0}
            onChange={(value) => {
              setParams({ donem: value, profil: undefined })
            }}
            options={eligible.map((item) => ({
              value: item.id,
              label: `${monthLabel(item.month)} · ${item.legalEntityTitle}`,
            }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payroll-profile">Aktarım profili</FieldLabel>
          <SimpleSelect
            id="payroll-profile"
            value={profileId}
            onChange={(value) => {
              setParams({ profil: value })
            }}
            options={(profiles.data?.items ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </Field>
      </div>
      {profile ? (
        <p className="text-sm text-muted-foreground">
          {PAYROLL_FORMAT_LABELS[profile.format]}
          {profile.format === "xlsx"
            ? ""
            : ` · ${PAYROLL_ENCODING_LABELS[profile.encoding]}`}
          {profile.simulated
            ? ' · Hazır profil gerçek şablonla doğrulanana kadar "taklit" olarak işaretlidir.'
            : ""}
        </p>
      ) : null}

      {!period ? (
        <EmptyState
          icon={FileSpreadsheetIcon}
          title="Aktarılacak dönemi seçin"
          description="Yalnızca İK onaylı veya kilitli dönemler bordroya aktarılabilir."
        />
      ) : preview.isError ? (
        <ErrorState
          error={preview.error}
          onRetry={() => void preview.refetch()}
        />
      ) : !preview.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <CardTitle>Önizleme</CardTitle>
              <CardDescription>
                {preview.data.fileName} · {preview.data.totalRows} satır
                {preview.data.totalRows > preview.data.rows.length
                  ? ` (ilk ${preview.data.rows.length} gösteriliyor)`
                  : ""}
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                exporter.mutate()
              }}
              disabled={errorRows > 0 || exporter.isPending}
            >
              {exporter.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              Dışa aktar
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {errorRows > 0 ? (
              <Alert variant="destructive">
                <AlertTitle>
                  {errorRows} satırda hata var; dışa aktarım engellendi
                </AlertTitle>
                <AlertDescription>
                  Puantajı düzeltin veya profilin kod eşlemesini kontrol edin.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="max-h-[480px] overflow-auto rounded-lg border">
              <Table>
                <TableCaption className="sr-only">
                  Bordro dosyası önizlemesi
                </TableCaption>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    {preview.data.headers.map((header, index) => (
                      <TableHead
                        key={`${header}-${index}`}
                        className="whitespace-nowrap"
                      >
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.data.rows.map((row) => (
                    <TableRow
                      key={row.personnelId}
                      data-invalid={row.errors.length > 0 || undefined}
                      className={cn(
                        row.errors.length > 0 &&
                          "bg-destructive/10 hover:bg-destructive/15"
                      )}
                    >
                      {row.values.map((value, index) => (
                        <TableCell
                          key={index}
                          className="whitespace-nowrap tabular-nums"
                        >
                          {formatPayrollValue(
                            value,
                            profile?.decimalSeparator ?? ","
                          )}
                        </TableCell>
                      ))}
                      {row.errors.length > 0 ? (
                        <TableCell
                          className="min-w-72 text-xs whitespace-normal text-destructive"
                          role="alert"
                        >
                          {row.errors.join(" ")}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Aktarım geçmişi</CardTitle>
          <CardDescription>
            Kim, ne zaman, hangi dönem ve hangi profille dosya üretti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.isError ? (
            <ErrorState
              error={history.error}
              onRetry={() => void history.refetch()}
            />
          ) : !history.data ? (
            <Skeleton className="h-24 w-full" />
          ) : history.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz aktarım yapılmadı.
            </p>
          ) : (
            <Table>
              <TableCaption className="sr-only">Aktarım geçmişi</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Zaman</TableHead>
                  <TableHead>Dönem</TableHead>
                  <TableHead>Profil</TableHead>
                  <TableHead>Dosya</TableHead>
                  <TableHead>Üreten</TableHead>
                  <TableHead>
                    <span className="sr-only">İndir</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="tabular-nums">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                    <TableCell className="capitalize">
                      {item.periodLabel} · {item.legalEntityTitle}
                    </TableCell>
                    <TableCell>{item.profileName}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {item.fileName}
                        <StatusBadge tone="neutral">
                          {item.rowCount} satır
                        </StatusBadge>
                      </span>
                    </TableCell>
                    <TableCell>{item.createdBy}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={downloading === item.id}
                        onClick={() => void download(item.id, item.fileName)}
                        aria-label={`${item.fileName} dosyasını indir`}
                      >
                        <DownloadIcon data-icon="inline-start" />
                        İndir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
