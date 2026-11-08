import { cn } from "@/shared/lib/utils"

/**
 * Sihirbaz adımları (`aria-current="step"`). İçe aktarma ve sözleşme sihirbazında kullanılır.
 * `onSelect` verilirse tamamlanmış adımlara geri dönülebilir.
 */
export function StepIndicator<T extends string>({
  steps,
  current,
  label = "Adımlar",
  onSelect,
}: {
  steps: readonly { id: T; label: string }[]
  current: T
  label?: string
  onSelect?: (step: T) => void
}) {
  const index = steps.findIndex((item) => item.id === current)
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label={label}>
      {steps.map((item, position) => {
        const className = cn(
          "rounded-full px-3 py-1",
          position === index
            ? "bg-primary text-primary-foreground"
            : position < index
              ? "bg-muted"
              : "text-muted-foreground"
        )
        const text = `${position + 1}. ${item.label}`
        return (
          <li
            key={item.id}
            aria-current={position === index ? "step" : undefined}
          >
            {onSelect && position < index ? (
              <button
                type="button"
                className={cn(className, "hover:underline")}
                onClick={() => {
                  onSelect(item.id)
                }}
              >
                {text}
              </button>
            ) : (
              <span className={cn(className, "inline-block")}>{text}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
