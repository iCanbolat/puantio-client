import { useMutation, useQuery } from "@tanstack/react-query"
import {
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { z } from "zod"

import { can, useSession, type Permission } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import { getErrorMessage } from "@/shared/api/errors"
import { FileDropzone } from "@/shared/components/file-dropzone"
import { PageHeader } from "@/shared/components/page-header"
import { ProgressBar } from "@/shared/components/progress-bar"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { csvBlob, downloadBlob, toCsv } from "@/shared/lib/download"
import { formatNumber } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
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

import { checkExisting, importBatch } from "../api/import-api"
import {
  autoMapColumns,
  chunk,
  errorReportRows,
  missingRequiredFields,
  validateRows,
  type ColumnMapping,
  type RowError,
} from "../domain/import-domain"
import {
  IMPORT_ENTITIES,
  buildImportDefinitions,
  importEntitySchema,
  type DuplicateStrategy,
  type ImportBatchResult,
  type ImportDefinition,
  type ImportEntity,
} from "../model/import-definitions"
import { buildTemplate, readWorkbook, type ParsedSheet } from "../lib/workbook"

const ENTITY_PERMISSION: Record<ImportEntity, Permission> = {
  personnel: "personnel:write",
  locations: "location:write",
  customers: "customer:write",
  "legal-entities": "org:write",
}

const CHUNK_SIZE = 50
const NONE = "__none"
const MAX_FILE_BYTES = 10 * 1024 * 1024

const pageSchema = z.object({
  tur: importEntitySchema.optional().catch(undefined),
})

type Step = "file" | "mapping" | "validation" | "done"

function StepIndicator({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "file", label: "Dosya" },
    { id: "mapping", label: "Sütun eşleştirme" },
    { id: "validation", label: "Doğrulama" },
    { id: "done", label: "Sonuç" },
  ]
  const current = steps.findIndex((item) => item.id === step)
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label="Adımlar">
      {steps.map((item, index) => (
        <li
          key={item.id}
          aria-current={index === current ? "step" : undefined}
          className={cn(
            "rounded-full px-3 py-1",
            index === current
              ? "bg-primary text-primary-foreground"
              : index < current
                ? "bg-muted"
                : "text-muted-foreground"
          )}
        >
          {index + 1}. {item.label}
        </li>
      ))}
    </ol>
  )
}

export function ImportPage() {
  const terms = useTerms()
  const me = useSession()
  const definitions = useMemo(
    () =>
      buildImportDefinitions({
        location: terms.location.singular,
        orgLevel: terms.orgLevels.at(-1)?.singular ?? "Bölge",
      }),
    [terms]
  )
  const allowed = IMPORT_ENTITIES.filter((entity) =>
    can(me, ENTITY_PERMISSION[entity])
  )
  const [{ tur }, setPage] = useSearchParamsState(pageSchema)
  const entity = tur && allowed.includes(tur) ? tur : undefined

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Excel'den içe aktar"
        description="Mevcut Excel listelerinizi Puantio'ya taşıyın. Satırlar gönderilmeden önce doğrulanır; hatalı satırlar raporlanır."
      />
      <Card>
        <CardHeader>
          <CardTitle>Ne içe aktarılacak?</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            role="radiogroup"
            aria-label="İçe aktarma türü"
          >
            {allowed.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={entity === item}
                onClick={() => {
                  setPage({ tur: item })
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted",
                  entity === item && "border-primary bg-primary/5"
                )}
              >
                <FileSpreadsheetIcon
                  className="size-5 text-muted-foreground"
                  aria-hidden
                />
                <span className="font-medium">{definitions[item].label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      {entity ? (
        <ImportWizard key={entity} definition={definitions[entity]} />
      ) : null}
    </div>
  )
}

function ImportWizard({ definition }: { definition: ImportDefinition }) {
  const [step, setStep] = useState<Step>("file")
  const [files, setFiles] = useState<File[]>([])
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null)
  const [sheetName, setSheetName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [strategy, setStrategy] = useState<DuplicateStrategy>("skip")
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<
    (ImportBatchResult & { failed: RowError[] }) | null
  >(null)

  const sheet = sheets?.find((item) => item.name === sheetName) ?? null

  const onFiles = async (next: File[]) => {
    setFiles(next)
    setParseError(null)
    const file = next[0]
    if (!file) {
      setSheets(null)
      return
    }
    try {
      const parsed = await readWorkbook(file)
      const first = parsed.find((item) => item.rows.length > 0) ?? parsed[0]
      setSheets(parsed)
      setSheetName(first?.name ?? null)
      if (first) setMapping(autoMapColumns(first.headers, definition.fields))
    } catch {
      setParseError("Dosya okunamadı. Excel (.xlsx) veya CSV dosyası seçin.")
      setSheets(null)
    }
  }

  const validation = useMemo(() => {
    if (!sheet || step === "file" || step === "mapping") return null
    const base = validateRows(definition, sheet.rows, mapping)
    // Dosya içinde tekrar eden anahtar: ilk satır kalır, diğerleri hata
    const duplicateRows = new Map<number, number>()
    for (const duplicate of base.inFileDuplicates) {
      const [first, ...rest] = duplicate.rows
      for (const row of rest) duplicateRows.set(row, first ?? row)
    }
    const errors: RowError[] = [
      ...base.errors,
      ...[...duplicateRows.entries()].map(([row, first]) => ({
        row,
        column:
          definition.fields.find(
            (field) => field.key === definition.duplicateKey
          )?.label ?? definition.duplicateLabel,
        message: `Dosyada tekrar ediyor (satır ${first} ile aynı ${definition.duplicateLabel})`,
      })),
    ].sort((a, b) => a.row - b.row)
    const valid = base.valid.filter((item) => !duplicateRows.has(item.row))
    return { valid, errors }
  }, [sheet, step, definition, mapping])

  const keys = useMemo(
    () =>
      (validation?.valid ?? [])
        .map((item) => item.data[definition.duplicateKey])
        .filter((key): key is string => typeof key === "string" && key !== ""),
    [validation, definition.duplicateKey]
  )
  const existing = useQuery({
    queryKey: ["import", definition.entity, "existing", keys],
    queryFn: () => checkExisting(definition.entity, keys),
    enabled: step === "validation" && keys.length > 0,
    staleTime: 0,
  })

  const submit = useMutation({
    mutationFn: async () => {
      const rows = validation?.valid ?? []
      const batches = chunk(rows, CHUNK_SIZE)
      const total: ImportBatchResult & { failed: RowError[] } = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        failed: [],
      }
      setProgress({ done: 0, total: rows.length })
      let done = 0
      for (const batch of batches) {
        const response = await importBatch(
          definition.entity,
          batch.map((item) => item.data),
          strategy
        )
        total.created += response.created
        total.updated += response.updated
        total.skipped += response.skipped
        for (const error of response.errors) {
          total.failed.push({
            row: batch[error.index]?.row ?? 0,
            column: "—",
            message: error.message,
          })
        }
        done += batch.length
        setProgress({ done, total: rows.length })
      }
      return total
    },
    meta: { silent: true },
    onSuccess: (value) => {
      setResult(value)
      setStep("done")
    },
  })

  const missing = missingRequiredFields(mapping, definition.fields)
  const reset = () => {
    setStep("file")
    setFiles([])
    setSheets(null)
    setResult(null)
    setProgress({ done: 0, total: 0 })
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>{definition.label} içe aktarma</CardTitle>
        <StepIndicator step={step} />
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {step === "file" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  downloadBlob(
                    buildTemplate(definition),
                    `puantio-${definition.entity}-sablon.xlsx`
                  )
                }}
              >
                <DownloadIcon data-icon="inline-start" />
                Şablonu indir
              </Button>
              <span className="text-sm text-muted-foreground">
                Sütunlar:{" "}
                {definition.fields
                  .map((field) => `${field.label}${field.required ? "*" : ""}`)
                  .join(", ")}
              </span>
            </div>
            <FileDropzone
              files={files}
              onFilesChange={(next) => void onFiles(next)}
              accept=".xlsx,.xls,.csv"
              maxSizeBytes={MAX_FILE_BYTES}
              label="Excel dosyası yükle"
              description="En fazla 10 MB; ilk satır başlık olmalı."
            />
            {parseError ? (
              <Alert variant="destructive">
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            ) : null}
            {sheets && sheets.length > 1 ? (
              <div className="flex max-w-sm flex-col gap-2">
                <label htmlFor="import-sheet" className="text-sm font-medium">
                  Sayfa
                </label>
                <Select
                  value={sheetName}
                  onValueChange={(name) => {
                    const next = sheets.find((item) => item.name === name)
                    setSheetName(next?.name ?? null)
                    if (next)
                      setMapping(
                        autoMapColumns(next.headers, definition.fields)
                      )
                  }}
                  items={sheets.map((item) => ({
                    value: item.name,
                    label: `${item.name} (${item.rows.length} satır)`,
                  }))}
                >
                  <SelectTrigger id="import-sheet" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((item) => (
                      <SelectItem key={item.name} value={item.name}>
                        {item.name} ({item.rows.length} satır)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {sheet ? (
              <div className="flex items-center gap-3">
                <p className="text-sm" aria-live="polite">
                  {formatNumber(sheet.rows.length)} satır okundu.
                </p>
                <Button
                  onClick={() => {
                    setStep("mapping")
                  }}
                  disabled={sheet.rows.length === 0}
                >
                  Devam
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {step === "mapping" && sheet ? (
          <>
            <Table>
              <TableCaption>
                Excel sütunlarını Puantio alanlarıyla eşleştirin. Otomatik
                eşleşmeleri kontrol edin.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Alan</TableHead>
                  <TableHead>Excel sütunu</TableHead>
                  <TableHead>İlk satırdaki değer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {definition.fields.map((field) => {
                  const header = mapping[field.key] ?? null
                  const sample = header ? sheet.rows[0]?.[header] : undefined
                  const items = [
                    { value: NONE, label: "— Eşleştirme —" },
                    ...sheet.headers.map((item) => ({
                      value: item,
                      label: item,
                    })),
                  ]
                  return (
                    <TableRow key={field.key}>
                      <TableCell className="font-medium">
                        {field.label}
                        {field.required ? (
                          <span className="text-destructive"> *</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={header ?? NONE}
                          onValueChange={(value) => {
                            setMapping((current) => ({
                              ...current,
                              [field.key]:
                                value === NONE || value === null ? null : value,
                            }))
                          }}
                          items={items}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-56"
                            aria-label={`${field.label} sütunu`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {items.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {sample === undefined || sample === null
                          ? "—"
                          : sample instanceof Date
                            ? sample.toLocaleDateString("tr-TR")
                            : String(sample)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {missing.length > 0 ? (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertDescription>
                  Zorunlu alanlar eşleştirilmedi:{" "}
                  {missing.map((field) => field.label).join(", ")}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("file")
                }}
              >
                Geri
              </Button>
              <Button
                onClick={() => {
                  setStep("validation")
                }}
                disabled={missing.length > 0}
              >
                Doğrula
              </Button>
            </div>
          </>
        ) : null}

        {step === "validation" && validation ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
              <p className="rounded-xl border p-4">
                <span className="block text-2xl font-semibold tabular-nums">
                  {formatNumber(sheet?.rows.length ?? 0)}
                </span>
                <span className="text-sm text-muted-foreground">
                  toplam satır
                </span>
              </p>
              <p className="rounded-xl border p-4">
                <span className="block text-2xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {formatNumber(validation.valid.length)}
                </span>
                <span className="text-sm text-muted-foreground">
                  satır içe aktarılmaya hazır
                </span>
              </p>
              <p className="rounded-xl border p-4">
                <span className="block text-2xl font-semibold text-destructive tabular-nums">
                  {formatNumber(validation.errors.length)}
                </span>
                <span className="text-sm text-muted-foreground">hata</span>
              </p>
            </div>
            {validation.errors.length > 0 ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-medium">Hatalı satırlar</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      downloadBlob(
                        csvBlob(toCsv(errorReportRows(validation.errors))),
                        `puantio-${definition.entity}-hata-raporu.csv`
                      )
                    }}
                  >
                    <DownloadIcon data-icon="inline-start" />
                    Hata raporunu indir
                  </Button>
                </div>
                <Table>
                  <TableCaption className="sr-only">
                    Doğrulama hataları
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Satır</TableHead>
                      <TableHead>Sütun</TableHead>
                      <TableHead>Hata</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validation.errors.slice(0, 200).map((error) => (
                      <TableRow
                        key={`${error.row}-${error.column}`}
                        data-testid="import-error"
                      >
                        <TableCell className="tabular-nums">
                          {error.row}
                        </TableCell>
                        <TableCell>{error.column}</TableCell>
                        <TableCell>{error.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {existing.isFetching ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Sistemdeki kayıtlarla karşılaştırılıyor…
              </p>
            ) : existing.data && existing.data.length > 0 ? (
              <Alert>
                <AlertTitle>
                  {formatNumber(existing.data.length)} kayıt sistemde zaten var
                  ({definition.duplicateLabel})
                </AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  <span>
                    {existing.data
                      .slice(0, 5)
                      .map((item) => item.label)
                      .join(", ")}
                    {existing.data.length > 5 ? "…" : ""}
                  </span>
                  <fieldset className="flex flex-wrap gap-4">
                    <legend className="sr-only">Mevcut kayıtlar için</legend>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="duplicate-strategy"
                        className="accent-primary"
                        checked={strategy === "update"}
                        onChange={() => {
                          setStrategy("update")
                        }}
                      />
                      Mevcut kaydı güncelle
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="duplicate-strategy"
                        className="accent-primary"
                        checked={strategy === "skip"}
                        onChange={() => {
                          setStrategy("skip")
                        }}
                      />
                      Atla
                    </label>
                  </fieldset>
                </AlertDescription>
              </Alert>
            ) : null}
            {submit.isPending ? (
              <div className="flex flex-col gap-2">
                <ProgressBar
                  value={progress.done}
                  max={progress.total}
                  label="İçe aktarma ilerlemesi"
                />
                <p className="text-sm text-muted-foreground tabular-nums">
                  {progress.done} / {progress.total}
                </p>
              </div>
            ) : null}
            {submit.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {getErrorMessage(submit.error)} Gönderilen parçalar
                  kaydedildi; kalan satırlar için tekrar deneyin.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("mapping")
                }}
                disabled={submit.isPending}
              >
                Geri
              </Button>
              <Button
                onClick={() => {
                  submit.mutate()
                }}
                disabled={
                  validation.valid.length === 0 ||
                  submit.isPending ||
                  existing.isFetching
                }
              >
                {submit.isPending ? <Spinner data-icon="inline-start" /> : null}
                {formatNumber(validation.valid.length)} satırı içe aktar
              </Button>
            </div>
          </>
        ) : null}

        {step === "done" && result ? (
          <>
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>İçe aktarma tamamlandı</AlertTitle>
              <AlertDescription>
                {result.created} yeni, {result.updated} güncellenen,{" "}
                {result.skipped} atlanan kayıt
                {result.failed.length > 0
                  ? `, ${result.failed.length} satır sunucuda reddedildi`
                  : ""}
                .
              </AlertDescription>
            </Alert>
            {result.failed.length > 0 ? (
              <Table>
                <TableCaption className="sr-only">
                  Sunucuda reddedilen satırlar
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Satır</TableHead>
                    <TableHead>Hata</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.failed.map((error) => (
                    <TableRow key={`${error.row}-${error.message}`}>
                      <TableCell className="tabular-nums">
                        {error.row}
                      </TableCell>
                      <TableCell>{error.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
            <CardDescription>
              <Button variant="outline" onClick={reset}>
                Yeni dosya yükle
              </Button>
            </CardDescription>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
