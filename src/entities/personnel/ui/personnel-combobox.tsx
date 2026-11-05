import { AsyncCombobox } from "@/shared/components/async-combobox"

import { fetchPersonnelOptions, personnelKeys } from "../api/personnel-api"

export function PersonnelCombobox({
  value,
  selectedLabel,
  onValueChange,
  floaterOnly = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: string | null
  selectedLabel?: string | undefined
  onValueChange: (value: string | null, label: string | null) => void
  floaterOnly?: boolean
  className?: string
  "aria-label"?: string
}) {
  return (
    <AsyncCombobox
      aria-label={ariaLabel ?? "Personel"}
      placeholder="Ad, soyad veya sicil ara…"
      queryKey={personnelKeys.options(floaterOnly ? "floater" : undefined)}
      fetchOptions={(query, signal) =>
        fetchPersonnelOptions(query, signal, { floater: floaterOnly })
      }
      value={value}
      {...(selectedLabel ? { selectedLabel } : {})}
      onValueChange={(next, option) => {
        onValueChange(next, option?.label ?? null)
      }}
      className={className}
    />
  )
}
