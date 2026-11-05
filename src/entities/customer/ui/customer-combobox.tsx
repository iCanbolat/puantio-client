import { AsyncCombobox } from "@/shared/components/async-combobox"

import { customerKeys, fetchCustomerOptions } from "../api/customer-api"

export function CustomerCombobox({
  value,
  selectedLabel,
  onValueChange,
  className,
  "aria-label": ariaLabel = "Müşteri",
}: {
  value: string | null
  selectedLabel?: string
  onValueChange: (value: string | null, label: string | null) => void
  className?: string
  "aria-label"?: string
}) {
  return (
    <AsyncCombobox
      aria-label={ariaLabel}
      placeholder="Müşteri ara…"
      queryKey={customerKeys.options()}
      fetchOptions={fetchCustomerOptions}
      value={value}
      {...(selectedLabel ? { selectedLabel } : {})}
      onValueChange={(next, option) => {
        onValueChange(next, option?.label ?? null)
      }}
      className={className}
    />
  )
}
