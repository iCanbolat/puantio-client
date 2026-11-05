import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { cn } from "@/shared/lib/utils"

/** Sabit seçenekli seçim kutusu (form alanları için) */
export function SimpleSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  invalid,
  placeholder,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string
  value: T | null
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
  invalid?: boolean
  placeholder?: string
  className?: string
  disabled?: boolean
  "aria-label"?: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
      items={options}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className={cn("w-full", className)}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder={placeholder ?? "Seçin"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
