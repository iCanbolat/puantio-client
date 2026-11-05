import { useTerms } from "@/entities/tenant"
import { AsyncCombobox } from "@/shared/components/async-combobox"

import { fetchLocationOptions, locationKeys } from "../api/location-api"

export function LocationCombobox({
  value,
  selectedLabel,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: string | null
  selectedLabel?: string | undefined
  onValueChange: (value: string | null, label: string | null) => void
  className?: string
  "aria-label"?: string
}) {
  const terms = useTerms()
  return (
    <AsyncCombobox
      aria-label={ariaLabel ?? terms.location.singular}
      placeholder={`${terms.location.singular} ara (kod veya ad)…`}
      queryKey={locationKeys.options()}
      fetchOptions={fetchLocationOptions}
      value={value}
      {...(selectedLabel ? { selectedLabel } : {})}
      onValueChange={(next, option) => {
        onValueChange(next, option?.label ?? null)
      }}
      className={className}
    />
  )
}
