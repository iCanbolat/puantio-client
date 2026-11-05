import { useMutation } from "@tanstack/react-query"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import {
  CELL_CODES,
  CELL_CODE_LABELS,
  type CellCode,
} from "@/features/timesheet"
import { isApiError } from "@/shared/api/errors"
import { SimpleSelect } from "@/shared/components/simple-select"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"

import { payrollKeys, updateProfile } from "../api/payroll-api"
import {
  DELIMITERS,
  DELIMITER_LABELS,
  HOUR_MEASURES,
  HOUR_MEASURE_LABELS,
  PAYROLL_ENCODINGS,
  PAYROLL_ENCODING_LABELS,
  PAYROLL_FIELDS,
  PAYROLL_FIELD_LABELS,
  PAYROLL_FORMATS,
  PAYROLL_FORMAT_LABELS,
  payrollProfileSettingsSchema,
  type ColumnSource,
  type PayrollProfile,
  type PayrollProfileSettings,
  type ProfileColumn,
} from "../model/profile"

const MAPPABLE_CODES = CELL_CODES.filter((code) => code !== "-" && code !== "?")

function sourceKey(source: ColumnSource): string {
  switch (source.kind) {
    case "field":
      return `field:${source.field}`
    case "hours":
      return `hours:${source.measure}`
    case "days":
      return "days"
    case "dailyCodes":
      return "dailyCodes"
  }
}

function sourceFromKey(key: string, previous: ColumnSource): ColumnSource {
  if (key === "days")
    return previous.kind === "days" ? previous : { kind: "days", codes: ["N"] }
  if (key === "dailyCodes") return { kind: "dailyCodes" }
  const [kind, value] = key.split(":")
  if (kind === "hours")
    return { kind: "hours", measure: value as (typeof HOUR_MEASURES)[number] }
  return { kind: "field", field: value as (typeof PAYROLL_FIELDS)[number] }
}

const SOURCE_OPTIONS = [
  ...PAYROLL_FIELDS.map((field) => ({
    value: `field:${field}`,
    label: PAYROLL_FIELD_LABELS[field],
  })),
  { value: "days", label: "Gün toplamı (kodlar)" },
  ...HOUR_MEASURES.map((measure) => ({
    value: `hours:${measure}`,
    label: HOUR_MEASURE_LABELS[measure],
  })),
  { value: "dailyCodes", label: "Günlük kodlar (her gün bir kolon)" },
]

export function ProfileEditorDialog({
  profile,
  onClose,
}: {
  profile: PayrollProfile | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={profile !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        {profile ? (
          <ProfileEditor key={profile.id} profile={profile} onDone={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ProfileEditor({
  profile,
  onDone,
}: {
  profile: PayrollProfile
  onDone: () => void
}) {
  const [draft, setDraft] = useState<PayrollProfileSettings>(() => ({
    name: profile.name,
    description: profile.description,
    format: profile.format,
    encoding: profile.encoding,
    delimiter: profile.delimiter,
    decimalSeparator: profile.decimalSeparator,
    includeHeader: profile.includeHeader,
    columns: profile.columns,
    codeMap: profile.codeMap,
  }))
  const [errors, setErrors] = useState<string[]>([])
  const mutation = useMutation({
    mutationFn: (body: PayrollProfileSettings) =>
      updateProfile(profile.id, body),
    meta: {
      silent: true,
      successMessage: "Profil kaydedildi",
      invalidates: [payrollKeys.all],
    },
  })
  const set = <K extends keyof PayrollProfileSettings>(
    key: K,
    value: PayrollProfileSettings[K]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const updateColumn = (index: number, patch: Partial<ProfileColumn>) => {
    set(
      "columns",
      draft.columns.map((column, position) =>
        position === index ? { ...column, ...patch } : column
      )
    )
  }
  const move = (index: number, delta: number) => {
    const next = [...draft.columns]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(index + delta, 0, item)
    set("columns", next)
  }
  const usesDailyCodes = draft.columns.some(
    (column) => column.source.kind === "dailyCodes"
  )

  const save = async () => {
    const parsed = payrollProfileSettingsSchema.safeParse(draft)
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => issue.message))
      return
    }
    try {
      await mutation.mutateAsync(parsed.data)
      onDone()
    } catch (error) {
      setErrors([isApiError(error) ? error.message : "Profil kaydedilemedi"])
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Aktarım profilini düzenle</DialogTitle>
        <DialogDescription>
          Kolon sırası, kaynakları ve kod eşlemesi bordro dosyasını belirler.
          Gün kolonlarının toplamı dönemdeki gün sayısına eşit olmalıdır.
        </DialogDescription>
      </DialogHeader>
      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-disc pl-4">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="pp-name">Profil adı</FieldLabel>
          <Input
            id="pp-name"
            value={draft.name}
            onChange={(event) => {
              set("name", event.target.value)
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="pp-desc">Açıklama</FieldLabel>
          <Input
            id="pp-desc"
            value={draft.description}
            onChange={(event) => {
              set("description", event.target.value)
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="pp-format">Dosya tipi</FieldLabel>
          <SimpleSelect
            id="pp-format"
            value={draft.format}
            onChange={(value) => {
              set("format", value)
            }}
            options={PAYROLL_FORMATS.map((value) => ({
              value,
              label: PAYROLL_FORMAT_LABELS[value],
            }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="pp-encoding">Karakter kodlaması</FieldLabel>
          <SimpleSelect
            id="pp-encoding"
            value={draft.encoding}
            disabled={draft.format === "xlsx"}
            onChange={(value) => {
              set("encoding", value)
            }}
            options={PAYROLL_ENCODINGS.map((value) => ({
              value,
              label: PAYROLL_ENCODING_LABELS[value],
            }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="pp-delimiter">Ayraç</FieldLabel>
          <SimpleSelect
            id="pp-delimiter"
            value={draft.delimiter}
            disabled={draft.format !== "csv"}
            onChange={(value) => {
              set("delimiter", value)
            }}
            options={DELIMITERS.map((value) => ({
              value,
              label: DELIMITER_LABELS[value],
            }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="pp-decimal">Ondalık ayracı</FieldLabel>
          <SimpleSelect
            id="pp-decimal"
            value={draft.decimalSeparator}
            onChange={(value) => {
              set("decimalSeparator", value)
            }}
            options={[
              { value: ",", label: "Virgül (7,5)" },
              { value: ".", label: "Nokta (7.5)" },
            ]}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="pp-header"
          checked={draft.includeHeader}
          onCheckedChange={(checked) => {
            set("includeHeader", checked)
          }}
        />
        <label htmlFor="pp-header" className="text-sm">
          İlk satır başlık
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Kolonlar</legend>
        <ol className="flex flex-col gap-2">
          {draft.columns.map((column, index) => (
            <li
              key={index}
              className="flex flex-col gap-2 rounded-lg border p-2"
            >
              <div className="flex flex-wrap items-end gap-2">
                <span className="w-6 text-xs text-muted-foreground tabular-nums">
                  {index + 1}.
                </span>
                <Field className="min-w-40 flex-1">
                  <FieldLabel htmlFor={`pp-col-${index}`}>Başlık</FieldLabel>
                  <Input
                    id={`pp-col-${index}`}
                    value={column.header}
                    onChange={(event) => {
                      updateColumn(index, { header: event.target.value })
                    }}
                  />
                </Field>
                <Field className="min-w-52 flex-1">
                  <FieldLabel htmlFor={`pp-src-${index}`}>Kaynak</FieldLabel>
                  <SimpleSelect
                    id={`pp-src-${index}`}
                    value={sourceKey(column.source)}
                    onChange={(value) => {
                      updateColumn(index, {
                        source: sourceFromKey(value, column.source),
                      })
                    }}
                    options={SOURCE_OPTIONS}
                  />
                </Field>
                {draft.format === "txt" ? (
                  <Field className="w-20">
                    <FieldLabel htmlFor={`pp-width-${index}`}>
                      Genişlik
                    </FieldLabel>
                    <Input
                      id={`pp-width-${index}`}
                      type="number"
                      min={1}
                      value={column.width ?? 10}
                      onChange={(event) => {
                        updateColumn(index, {
                          width: Number(event.target.value) || null,
                        })
                      }}
                    />
                  </Field>
                ) : null}
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${column.header} kolonunu yukarı taşı`}
                    disabled={index === 0}
                    onClick={() => {
                      move(index, -1)
                    }}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${column.header} kolonunu aşağı taşı`}
                    disabled={index === draft.columns.length - 1}
                    onClick={() => {
                      move(index, 1)
                    }}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${column.header} kolonunu sil`}
                    onClick={() => {
                      set(
                        "columns",
                        draft.columns.filter(
                          (_, position) => position !== index
                        )
                      )
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
              {column.source.kind === "days" ? (
                <div
                  className="flex flex-wrap gap-x-3 gap-y-1 pl-8"
                  role="group"
                  aria-label={`${column.header} kodları`}
                >
                  {MAPPABLE_CODES.map((code) => {
                    const source = column.source as Extract<
                      ColumnSource,
                      { kind: "days" }
                    >
                    const checked = source.codes.includes(code)
                    return (
                      <span key={code} className="flex items-center gap-1">
                        <Checkbox
                          id={`pp-code-${index}-${code}`}
                          checked={checked}
                          onCheckedChange={(next) => {
                            const codes = next
                              ? [...source.codes, code]
                              : source.codes.filter((item) => item !== code)
                            updateColumn(index, {
                              source: { kind: "days", codes },
                            })
                          }}
                        />
                        <label
                          htmlFor={`pp-code-${index}-${code}`}
                          className="font-mono text-xs"
                          title={CELL_CODE_LABELS[code]}
                        >
                          {code}
                        </label>
                      </span>
                    )
                  })}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            set("columns", [
              ...draft.columns,
              {
                header: "Yeni kolon",
                source: { kind: "days", codes: ["N"] },
                width: 6,
              },
            ])
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Kolon ekle
        </Button>
      </fieldset>

      {usesDailyCodes ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            Kod eşleme (günlük kolonlar)
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MAPPABLE_CODES.map((code: CellCode) => (
              <Field key={code}>
                <FieldLabel htmlFor={`pp-map-${code}`}>
                  <span className="font-mono">{code}</span> → bordro kodu
                </FieldLabel>
                <Input
                  id={`pp-map-${code}`}
                  value={draft.codeMap[code] ?? ""}
                  placeholder={code}
                  maxLength={8}
                  onChange={(event) => {
                    const codeMap = { ...draft.codeMap }
                    if (event.target.value) codeMap[code] = event.target.value
                    else Reflect.deleteProperty(codeMap, code)
                    set("codeMap", codeMap)
                  }}
                />
              </Field>
            ))}
          </div>
          <FieldError />
        </fieldset>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button onClick={() => void save()} disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          Profili kaydet
        </Button>
      </DialogFooter>
    </>
  )
}
