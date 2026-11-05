import { cn } from "@/shared/lib/utils"

/** Erişilebilir ilerleme çubuğu (içe aktarma, toplu işlemler). */
export function ProgressBar({
  value,
  max = 100,
  label,
  className,
}: {
  value: number
  max?: number
  label: string
  className?: string
}) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`%${percent}`}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
