import { useQueries, useQuery } from "@tanstack/react-query"
import { XIcon } from "lucide-react"
import { useId, useState } from "react"

import { CustomerCombobox, customerQueries } from "@/entities/customer"
import { LocationCombobox, locationQueries } from "@/entities/location"
import { orgUnitQueries } from "@/entities/org-unit"
import type { AccessScope } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import { Label } from "@/shared/ui/label"

import { SCOPE_KINDS, type ScopeKind } from "../model/users-roles"

function Chips({
  ids,
  labels,
  onRemove,
}: {
  ids: readonly string[]
  labels: Map<string, string>
  onRemove: (id: string) => void
}) {
  if (ids.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Seçilen kayıtlar">
      {ids.map((id) => (
        <li
          key={id}
          className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-3 text-sm"
        >
          {labels.get(id) ?? id}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`${labels.get(id) ?? id} kaldır`}
            onClick={() => {
              onRemove(id)
            }}
          >
            <XIcon />
          </Button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Kullanıcının veri kapsamı: tümü, organizasyon birimleri, lokasyonlar veya (müşteri
 * kullanıcıları için) müşteriler. Filtreyi backend uygular.
 */
export function ScopePicker({
  value,
  onChange,
  error,
}: {
  value: AccessScope
  onChange: (scope: AccessScope) => void
  error?: string | undefined
}) {
  const terms = useTerms()
  const name = useId()
  const units = useQuery({
    ...orgUnitQueries.list(),
    enabled: value.kind === "org_units",
  })
  const ids = value.kind === "all" ? [] : value.ids
  const locationLabels = useQueries({
    queries: (value.kind === "locations" ? ids.slice(0, 20) : []).map((id) =>
      locationQueries.detail(id)
    ),
  })
  const customerLabels = useQueries({
    queries: (value.kind === "customers" ? ids.slice(0, 20) : []).map((id) =>
      customerQueries.detail(id)
    ),
  })
  const [picked, setPicked] = useState<Record<string, string>>({})
  const labels = new Map<string, string>(Object.entries(picked))
  for (const result of locationLabels)
    if (result.data)
      labels.set(result.data.id, `${result.data.code} · ${result.data.name}`)
  for (const result of customerLabels)
    if (result.data) labels.set(result.data.id, result.data.name)

  const KIND_LABELS: Record<ScopeKind, string> = {
    all: "Tüm firma",
    org_units: terms.orgLevels.map((level) => level.plural).join(" / "),
    locations: terms.location.plural,
    customers: "Müşteriler (müşteri portalı kullanıcısı)",
  }
  const setKind = (kind: ScopeKind) => {
    onChange(kind === "all" ? { kind: "all" } : { kind, ids: [] })
  }
  const add = (id: string | null) => {
    if (!id || value.kind === "all" || value.ids.includes(id)) return
    onChange({ ...value, ids: [...value.ids, id] })
  }
  const remove = (id: string) => {
    if (value.kind === "all") return
    onChange({ ...value, ids: value.ids.filter((item) => item !== id) })
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">Veri kapsamı</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {SCOPE_KINDS.map((kind) => (
          <label key={kind} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              value={kind}
              checked={value.kind === kind}
              onChange={() => {
                setKind(kind)
              }}
              className="accent-primary"
            />
            {KIND_LABELS[kind]}
          </label>
        ))}
      </div>
      {value.kind === "org_units" ? (
        <div className="grid max-h-48 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
          {(units.data ?? []).map((unit) => {
            const id = `${name}-unit-${unit.id}`
            return (
              <div key={unit.id} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={value.ids.includes(unit.id)}
                  onCheckedChange={(checked) => {
                    if (checked) add(unit.id)
                    else remove(unit.id)
                  }}
                />
                <Label htmlFor={id} className="font-normal">
                  {unit.level > 0 ? "— " : ""}
                  {unit.name}
                </Label>
              </div>
            )
          })}
        </div>
      ) : null}
      {value.kind === "locations" ? (
        <>
          <LocationCombobox
            aria-label={`${terms.location.singular} ekle`}
            value={null}
            onValueChange={(id, label) => {
              if (id && label)
                setPicked((current) => ({ ...current, [id]: label }))
              add(id)
            }}
            className="w-full"
          />
          <Chips ids={value.ids} labels={labels} onRemove={remove} />
        </>
      ) : null}
      {value.kind === "customers" ? (
        <>
          <CustomerCombobox
            aria-label="Müşteri ekle"
            value={null}
            onValueChange={(id) => {
              add(id)
            }}
            className="w-full"
          />
          <Chips ids={value.ids} labels={labels} onRemove={remove} />
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
