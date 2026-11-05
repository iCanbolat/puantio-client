import type { ReactNode } from "react"

import { cn } from "@/shared/lib/utils"

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"

const toneClasses: Record<StatusTone, { badge: string; dot: string }> = {
  success: {
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  warning: {
    badge: "bg-amber-500/10 text-amber-800 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  danger: {
    // text-destructive, açık zeminde 4.5:1 sınırının altında kalıyor
    badge: "bg-destructive/10 text-red-700 dark:text-red-400",
    dot: "bg-destructive",
  },
  info: {
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  // muted-foreground, muted zemin üzerinde WCAG AA (4.5:1) sınırının altında kalıyor
  neutral: {
    badge: "bg-muted text-neutral-700 dark:text-neutral-300",
    dot: "bg-neutral-500",
  },
}

/** Durum rozeti. Renk tek başına anlam taşımaz; metin her zaman görünür (erişilebilirlik). */
export function StatusBadge({
  tone,
  children,
  pulse = false,
  className,
}: {
  tone: StatusTone
  children: ReactNode
  pulse?: boolean
  className?: string
}) {
  const classes = toneClasses[tone]
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex h-6 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        classes.badge,
        className
      )}
    >
      <span className="relative flex size-1.5" aria-hidden>
        {pulse ? (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-75",
              classes.dot
            )}
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-1.5 rounded-full",
            classes.dot
          )}
        />
      </span>
      {children}
    </span>
  )
}
