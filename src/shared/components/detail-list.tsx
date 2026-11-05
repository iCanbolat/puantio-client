import type { ReactNode } from "react"

import { cn } from "@/shared/lib/utils"

/** Kart detaylarında etiket–değer listesi (dl). */
export function DetailList({
  items,
  className,
}: {
  items: { label: string; value: ReactNode }[]
  className?: string
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            {item.label}
          </dt>
          <dd className="text-sm break-words">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}
