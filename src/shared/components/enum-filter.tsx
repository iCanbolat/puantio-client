import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"

const ALL = "__all"

/** Liste filtrelerinde kullanılan "Tümü" seçenekli enum seçimi. */
export function EnumFilter<T extends string>({
  label,
  allLabel,
  value,
  options,
  labels,
  onChange,
  className = "w-44",
}: {
  label: string
  allLabel: string
  value: T | undefined
  options: readonly T[]
  labels: Record<T, string>
  onChange: (value: T | undefined) => void
  className?: string
}) {
  const items = [
    { value: ALL, label: allLabel },
    ...options.map((option) => ({ value: option, label: labels[option] })),
  ]
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => {
        onChange(next === ALL || next === null ? undefined : (next as T))
      }}
      items={items}
    >
      <SelectTrigger size="sm" className={className} aria-label={label}>
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
  )
}
