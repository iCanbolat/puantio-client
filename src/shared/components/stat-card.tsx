import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/shared/lib/utils"
import { Card, CardContent } from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"

export type StatTone = "default" | "success" | "warning" | "danger"

const toneClasses: Record<StatTone, string> = {
  default: "bg-muted text-foreground",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  isLoading = false,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: StatTone
  isLoading?: boolean
  className?: string
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <p className="font-heading text-2xl font-semibold tabular-nums">
              {value}
            </p>
          )}
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              toneClasses[tone]
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}
