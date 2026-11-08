import { useState } from "react"

import { kurus, parseTl, type Kurus } from "@/shared/lib/money"
import { Input } from "@/shared/ui/input"

const display = (value: Kurus | null) =>
  value === null || value === 0
    ? ""
    : new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value / 100)

/** TL tutar girişi ("1.234,56"); değer kuruş olarak tutulur, boş alan 0 sayılır. */
export function MoneyInput({
  id,
  value,
  onChange,
  invalid,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
}: {
  id?: string
  value: Kurus
  onChange: (value: Kurus) => void
  invalid?: boolean
  "aria-label"?: string
  "aria-describedby"?: string
}) {
  const [text, setText] = useState(display(value))
  const [parseError, setParseError] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || parseError || undefined}
        className="pr-8 text-right tabular-nums"
        onChange={(event) => {
          setText(event.target.value)
          const trimmed = event.target.value.trim()
          const parsed = trimmed === "" ? kurus(0) : parseTl(trimmed)
          setParseError(parsed === null)
          if (parsed !== null) onChange(parsed)
        }}
        onBlur={() => {
          if (!parseError) setText(display(value))
        }}
      />
      <span
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
        aria-hidden
      >
        ₺
      </span>
    </div>
  )
}
