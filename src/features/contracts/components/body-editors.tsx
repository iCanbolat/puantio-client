import { useQuery } from "@tanstack/react-query"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useId, useMemo, useState } from "react"

import { locationQueries } from "@/entities/location"
import { OrgUnitSelect } from "@/entities/org-unit"
import { POSITIONS, POSITION_LABELS, type Position } from "@/entities/personnel"
import {
  SERVICE_LINE_LABELS,
  useTenant,
  type ServiceLine,
} from "@/entities/tenant"
import { EmptyState } from "@/shared/components/empty-state"
import { SimpleSelect } from "@/shared/components/simple-select"
import { includesTr } from "@/shared/lib/format"
import { kurus } from "@/shared/lib/money"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import {
  COVERAGES,
  COVERAGE_LABELS,
  PRICE_ADJUSTMENT_KINDS,
  PRICE_ADJUSTMENT_LABELS,
  type Commitment,
  type ContractLocation,
  type ContractRules,
  type Prices,
  type ScopeItem,
} from "../model/contract"
import { MoneyInput } from "./money-input"

/** Alan yolu → hata mesajı ("commitments.0.headcount") */
export type ErrorMap = Readonly<Record<string, string>>

function ErrorText({
  id,
  message,
}: {
  id?: string
  message: string | undefined
}) {
  return message ? <FieldError id={id}>{message}</FieldError> : null
}

/* ─────────────────────────── Kapsam ─────────────────────────── */

export function ScopeEditor({
  serviceLines,
  scopeItems,
  onChange,
  errors,
}: {
  serviceLines: readonly ServiceLine[]
  scopeItems: readonly ScopeItem[]
  onChange: (patch: {
    serviceLines?: ServiceLine[]
    scopeItems?: ScopeItem[]
  }) => void
  errors: ErrorMap
}) {
  const tenant = useTenant()
  const id = useId()
  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend>Hizmet hatları</FieldLegend>
        <div className="grid gap-2 sm:grid-cols-3">
          {tenant.serviceLines.map((line) => (
            <div key={line} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${line}`}
                checked={serviceLines.includes(line)}
                onCheckedChange={(checked) => {
                  onChange({
                    serviceLines: checked
                      ? [...serviceLines, line]
                      : serviceLines.filter((item) => item !== line),
                    scopeItems: checked
                      ? [...scopeItems]
                      : scopeItems.filter((item) => item.serviceLine !== line),
                  })
                }}
              />
              <Label htmlFor={`${id}-${line}`}>
                {SERVICE_LINE_LABELS[line]}
              </Label>
            </div>
          ))}
        </div>
        <ErrorText message={errors.serviceLines} />
      </FieldSet>
      <FieldSet>
        <FieldLegend>Kalem bazında kapsam</FieldLegend>
        <FieldDescription>
          Teknik şartnamedeki hizmet kalemleri (ör. "Genel alan temizliği", "Cam
          silme, ayda 1").
        </FieldDescription>
        {scopeItems.map((item, index) => (
          <div key={index} className="flex flex-wrap items-start gap-2">
            <SimpleSelect<ServiceLine>
              aria-label={`${index + 1}. kalemin hizmet hattı`}
              className="sm:w-48"
              value={item.serviceLine}
              options={serviceLines.map((line) => ({
                value: line,
                label: SERVICE_LINE_LABELS[line],
              }))}
              onChange={(serviceLine) => {
                onChange({
                  scopeItems: scopeItems.map((current, i) =>
                    i === index ? { ...current, serviceLine } : current
                  ),
                })
              }}
            />
            <div className="min-w-48 flex-1">
              <Input
                aria-label={`${index + 1}. kalem açıklaması`}
                value={item.description}
                aria-invalid={Boolean(
                  errors[`scopeItems.${index}.description`]
                )}
                onChange={(event) => {
                  onChange({
                    scopeItems: scopeItems.map((current, i) =>
                      i === index
                        ? { ...current, description: event.target.value }
                        : current
                    ),
                  })
                }}
              />
              <ErrorText message={errors[`scopeItems.${index}.description`]} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${index + 1}. kalemi kaldır`}
              onClick={() => {
                onChange({
                  scopeItems: scopeItems.filter((_, i) => i !== index),
                })
              }}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={serviceLines.length === 0}
            onClick={() => {
              const first = serviceLines[0]
              if (!first) return
              onChange({
                scopeItems: [
                  ...scopeItems,
                  { serviceLine: first, description: "" },
                ],
              })
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Kalem ekle
          </Button>
        </div>
      </FieldSet>
    </FieldGroup>
  )
}

/* ─────────────────────────── Lokasyonlar ─────────────────────────── */

export function LocationPicker({
  customerId,
  locations,
  defaultFrom,
  onChange,
  errors,
  allowRemovalDate = false,
}: {
  customerId: string
  locations: readonly ContractLocation[]
  defaultFrom: string
  /** `targets`: yeni seçilen lokasyonların hedef kadrosu (taahhüt önerisi) */
  onChange: (
    locations: ContractLocation[],
    targets?: Readonly<Record<string, number>>
  ) => void
  errors: ErrorMap
  /** Zeyilnamede lokasyonun kapsamdan çıkış tarihi girilebilir */
  allowRemovalDate?: boolean
}) {
  const [search, setSearch] = useState("")
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null)
  const query = useQuery(
    locationQueries.list({
      customerId,
      page: 1,
      pageSize: 100,
      ...(orgUnitId ? { orgUnitId } : {}),
    })
  )
  const selected = useMemo(
    () => new Map(locations.map((item) => [item.locationId, item])),
    [locations]
  )
  const items = (query.data?.items ?? []).filter(
    (item) => !search || includesTr(`${item.code} ${item.name}`, search)
  )
  const allSelected =
    items.length > 0 && items.every((item) => selected.has(item.id))

  const toggle = (
    item: {
      id: string
      name: string
      orgUnitName: string
      targetHeadcount: number
    },
    checked: boolean
  ) => {
    if (checked)
      onChange(
        [
          ...locations,
          {
            locationId: item.id,
            locationName: item.name,
            orgUnitName: item.orgUnitName,
            from: defaultFrom,
            to: null,
          },
        ],
        { [item.id]: item.targetHeadcount }
      )
    else
      onChange(locations.filter((location) => location.locationId !== item.id))
  }

  return (
    <FieldGroup>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="max-w-xs">
          <FieldLabel htmlFor="location-picker-search">Lokasyon ara</FieldLabel>
          <Input
            id="location-picker-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
            }}
            placeholder="Kod veya ad"
          />
        </Field>
        <Field className="max-w-xs">
          <FieldLabel htmlFor="location-picker-unit">Bölge</FieldLabel>
          <OrgUnitSelect
            id="location-picker-unit"
            value={orgUnitId}
            onValueChange={setOrgUnitId}
            allowAll
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={items.length === 0}
          onClick={() => {
            if (allSelected)
              onChange(
                locations.filter(
                  (location) =>
                    !items.some((item) => item.id === location.locationId)
                )
              )
            else
              onChange(
                [
                  ...locations,
                  ...items
                    .filter((item) => !selected.has(item.id))
                    .map((item) => ({
                      locationId: item.id,
                      locationName: item.name,
                      orgUnitName: item.orgUnitName,
                      from: defaultFrom,
                      to: null,
                    })),
                ],
                Object.fromEntries(
                  items.map((item) => [item.id, item.targetHeadcount])
                )
              )
          }}
        >
          {allSelected
            ? "Listelenenlerin seçimini kaldır"
            : "Listelenenlerin tümünü seç"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {locations.length} lokasyon seçildi
      </p>
      <ErrorText message={errors.locations} />
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Lokasyonlar yükleniyor…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Lokasyon yok"
          description="Bu müşteriye bağlı, filtreye uyan lokasyon bulunamadı."
        />
      ) : (
        <div className="max-h-96 overflow-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Müşteri lokasyonları</caption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Seç</span>
                </TableHead>
                <TableHead>Lokasyon</TableHead>
                <TableHead>Bölge</TableHead>
                <TableHead className="text-right">Hedef kadro</TableHead>
                {allowRemovalDate ? (
                  <TableHead>Kapsamdan çıkış</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const current = selected.get(item.id)
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`${item.name} seç`}
                        checked={Boolean(current)}
                        onCheckedChange={(checked) => {
                          toggle(item, checked)
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col">
                        <span className="font-medium">{item.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.code}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>{item.orgUnitName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.targetHeadcount}
                    </TableCell>
                    {allowRemovalDate ? (
                      <TableCell>
                        {current ? (
                          <Input
                            type="date"
                            className="w-40"
                            aria-label={`${item.name} kapsamdan çıkış tarihi`}
                            value={current.to ?? ""}
                            onChange={(event) => {
                              onChange(
                                locations.map((location) =>
                                  location.locationId === item.id
                                    ? {
                                        ...location,
                                        to: event.target.value || null,
                                      }
                                    : location
                                )
                              )
                            }}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </FieldGroup>
  )
}

/* ─────────────────────────── Taahhüt kadro ─────────────────────────── */

const positionOptions = POSITIONS.map((position) => ({
  value: position,
  label: POSITION_LABELS[position],
}))
const coverageOptions = COVERAGES.map((coverage) => ({
  value: coverage,
  label: COVERAGE_LABELS[coverage],
}))

export function CommitmentsEditor({
  locations,
  commitments,
  onChange,
  errors,
}: {
  locations: readonly ContractLocation[]
  commitments: readonly Commitment[]
  onChange: (commitments: Commitment[]) => void
  errors: ErrorMap
}) {
  const update = (index: number, patch: Partial<Commitment>) => {
    onChange(
      commitments.map((item, i) => (i === index ? { ...item, ...patch } : item))
    )
  }
  const total = commitments.reduce(
    (sum, item) => sum + (Number.isFinite(item.headcount) ? item.headcount : 0),
    0
  )
  return (
    <FieldGroup>
      <p className="text-sm">
        Toplam taahhüt kadro:{" "}
        <strong className="tabular-nums">{total} kişi</strong>
      </p>
      <ErrorText message={errors.commitments} />
      {locations.map((location) => {
        const rows = commitments
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.locationId === location.locationId)
        return (
          <FieldSet key={location.locationId} className="rounded-lg border p-3">
            <FieldLegend variant="label">{location.locationName}</FieldLegend>
            {rows.length === 0 ? (
              <p className="text-sm text-destructive">
                Bu lokasyon için taahhüt girin.
              </p>
            ) : null}
            {rows.map(({ item, index }) => {
              const prefix = `commitments.${index}`
              const label = `${location.locationName} ${POSITION_LABELS[item.position]}`
              const errorId = `${prefix}-error`
              return (
                <div key={index} className="flex flex-wrap items-start gap-2">
                  <SimpleSelect<Position>
                    aria-label={`${location.locationName} pozisyon`}
                    className="sm:w-56"
                    value={item.position}
                    options={positionOptions}
                    onChange={(position) => {
                      update(index, { position })
                    }}
                  />
                  <div className="w-32">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      aria-label={`${label} taahhüt kadro`}
                      aria-invalid={Boolean(errors[`${prefix}.headcount`])}
                      aria-describedby={
                        errors[`${prefix}.headcount`] ? errorId : undefined
                      }
                      value={
                        Number.isFinite(item.headcount) ? item.headcount : ""
                      }
                      onChange={(event) => {
                        update(index, {
                          headcount:
                            event.target.value === ""
                              ? Number.NaN
                              : Number(event.target.value),
                        })
                      }}
                    />
                  </div>
                  <SimpleSelect
                    aria-label={`${label} vardiya kapsamı`}
                    className="sm:w-48"
                    value={item.coverage}
                    options={coverageOptions}
                    onChange={(coverage) => {
                      update(index, { coverage })
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${label} satırını kaldır`}
                    onClick={() => {
                      onChange(commitments.filter((_, i) => i !== index))
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                  <div className="basis-full">
                    <ErrorText
                      id={errorId}
                      message={
                        errors[`${prefix}.headcount`] ??
                        errors[`${prefix}.locationId`]
                      }
                    />
                  </div>
                </div>
              )
            })}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onChange([
                    ...commitments,
                    {
                      locationId: location.locationId,
                      position: "cleaning_staff",
                      headcount: Number.NaN,
                      coverage: "six_days",
                    },
                  ])
                }}
              >
                <PlusIcon data-icon="inline-start" />
                {location.locationName} için pozisyon ekle
              </Button>
            </div>
          </FieldSet>
        )
      })}
    </FieldGroup>
  )
}

/* ─────────────────────────── Birim fiyatlar ─────────────────────────── */

export function PricesEditor({
  commitments,
  prices,
  onChange,
  errors,
}: {
  commitments: readonly Commitment[]
  prices: Prices
  onChange: (prices: Prices) => void
  errors: ErrorMap
}) {
  const positions = [...new Set(commitments.map((item) => item.position))]
  const priceOf = (position: Position) =>
    prices.unitPrices.find((item) => item.position === position)?.monthly ??
    kurus(0)
  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend>Kişi başı aylık birim fiyat</FieldLegend>
        <FieldDescription>
          Hakedişte günlük fiyat = aylık fiyat ÷ ayın planlı iş günü.
        </FieldDescription>
        <ErrorText message={errors["prices.unitPrices"]} />
        {positions.map((position) => {
          const index = prices.unitPrices.findIndex(
            (item) => item.position === position
          )
          const error = errors[`prices.unitPrices.${index}.monthly`]
          return (
            <Field key={position} data-invalid={Boolean(error) || undefined}>
              <FieldLabel htmlFor={`price-${position}`}>
                {POSITION_LABELS[position]} (kişi/ay)
              </FieldLabel>
              <div className="max-w-56">
                <MoneyInput
                  id={`price-${position}`}
                  value={priceOf(position)}
                  invalid={Boolean(error)}
                  onChange={(monthly) => {
                    const rest = prices.unitPrices.filter(
                      (item) => item.position !== position
                    )
                    onChange({
                      ...prices,
                      unitPrices: [...rest, { position, monthly }],
                    })
                  }}
                />
              </div>
              <ErrorText message={error} />
            </Field>
          )
        })}
      </FieldSet>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="price-overtime">
            Fazla mesai saat ücreti
          </FieldLabel>
          <MoneyInput
            id="price-overtime"
            value={prices.overtimeHourly}
            onChange={(overtimeHourly) => {
              onChange({ ...prices, overtimeHourly })
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="price-material">Aylık malzeme bedeli</FieldLabel>
          <MoneyInput
            id="price-material"
            value={prices.materialMonthly}
            onChange={(materialMonthly) => {
              onChange({ ...prices, materialMonthly })
            }}
          />
        </Field>
      </div>
    </FieldGroup>
  )
}

/* ─────────────────────────── Kurallar ─────────────────────────── */

function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  suffix,
  step = "1",
}: {
  id: string
  label: string
  value: number | null
  onChange: (value: number) => void
  error: string | undefined
  suffix?: string
  step?: string
}) {
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex max-w-40 items-center gap-2">
        <Input
          id={id}
          type="number"
          step={step}
          value={value === null || Number.isNaN(value) ? "" : value}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            onChange(
              event.target.value === ""
                ? Number.NaN
                : Number(event.target.value)
            )
          }}
        />
        {suffix ? (
          <span className="text-sm text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
      <ErrorText message={error} />
    </Field>
  )
}

export function RulesEditor({
  rules,
  onChange,
  errors,
  prefix = "rules",
}: {
  rules: ContractRules
  onChange: (rules: ContractRules) => void
  errors: ErrorMap
  prefix?: string
}) {
  const adjustment = rules.priceAdjustment
  const setAdjustment = (patch: Partial<ContractRules["priceAdjustment"]>) => {
    onChange({ ...rules, priceAdjustment: { ...adjustment, ...patch } })
  }
  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          id="rule-deduction"
          label="Eksik personel kesintisi"
          suffix="% günlük fiyat"
          value={rules.shortfallDeductionPercent}
          error={errors[`${prefix}.shortfallDeductionPercent`]}
          onChange={(shortfallDeductionPercent) => {
            onChange({ ...rules, shortfallDeductionPercent })
          }}
        />
        <Field>
          <FieldLabel htmlFor="rule-penalty">
            Eksik kişi-gün başı ceza
          </FieldLabel>
          <MoneyInput
            id="rule-penalty"
            value={rules.shortfallPenaltyPerPersonDay}
            onChange={(shortfallPenaltyPerPersonDay) => {
              onChange({ ...rules, shortfallPenaltyPerPersonDay })
            }}
          />
        </Field>
        <NumberField
          id="rule-vat"
          label="KDV oranı"
          suffix="%"
          value={rules.vatRate}
          error={errors[`${prefix}.vatRate`]}
          onChange={(vatRate) => {
            onChange({ ...rules, vatRate })
          }}
        />
      </div>
      <FieldSet>
        <FieldLegend>Fiyat farkı / revizyon</FieldLegend>
        <Field>
          <FieldLabel htmlFor="rule-adjustment">Kural</FieldLabel>
          <SimpleSelect
            id="rule-adjustment"
            value={adjustment.kind}
            options={PRICE_ADJUSTMENT_KINDS.map((kind) => ({
              value: kind,
              label: PRICE_ADJUSTMENT_LABELS[kind],
            }))}
            onChange={(kind) => {
              setAdjustment({ kind })
            }}
          />
        </Field>
        {adjustment.kind !== "none" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              id="rule-share"
              label="İşçilik payı"
              suffix="%"
              value={adjustment.laborSharePercent}
              error={errors[`${prefix}.priceAdjustment.laborSharePercent`]}
              onChange={(laborSharePercent) => {
                setAdjustment({ laborSharePercent })
              }}
            />
            {adjustment.kind === "fixed_rate" ? (
              <NumberField
                id="rule-rate"
                label="Artış oranı"
                suffix="%"
                step="0.1"
                value={adjustment.ratePercent}
                error={errors[`${prefix}.priceAdjustment.ratePercent`]}
                onChange={(ratePercent) => {
                  setAdjustment({ ratePercent })
                }}
              />
            ) : null}
            <Field>
              <FieldLabel htmlFor="rule-adjustment-date">
                {adjustment.kind === "min_wage"
                  ? "Baz tarih"
                  : "Yürürlük tarihi"}
              </FieldLabel>
              <Input
                id="rule-adjustment-date"
                type="date"
                value={adjustment.effectiveFrom ?? ""}
                onChange={(event) => {
                  setAdjustment({ effectiveFrom: event.target.value || null })
                }}
              />
              {adjustment.kind === "min_wage" ? (
                <FieldDescription>
                  Boşsa sözleşme başlangıcındaki asgari ücret baz alınır.
                </FieldDescription>
              ) : null}
            </Field>
          </div>
        ) : null}
      </FieldSet>
      <FieldSet>
        <FieldLegend>Ceza maddeleri</FieldLegend>
        <FieldDescription>
          Hakedişte elle eklenebilecek cezalar (sabit tutar veya işçilik
          tutarının yüzdesi).
        </FieldDescription>
        {rules.penalties.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ceza maddesi yok.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {rules.penalties.map((penalty) => (
              <li key={penalty.code}>
                <span className="font-mono text-xs">{penalty.code}</span> ·{" "}
                {penalty.label} ·{" "}
                {penalty.kind === "fixed"
                  ? new Intl.NumberFormat("tr-TR", {
                      style: "currency",
                      currency: "TRY",
                    }).format(penalty.amount / 100)
                  : `%${penalty.amount}`}
              </li>
            ))}
          </ul>
        )}
      </FieldSet>
    </FieldGroup>
  )
}
