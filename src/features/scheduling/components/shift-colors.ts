import type { ShiftColor } from "@/entities/shift"

export const SHIFT_COLOR_CLASSES: Record<ShiftColor, string> = {
  sky: "bg-sky-500/15 text-sky-900 ring-sky-500/30 dark:text-sky-200",
  amber: "bg-amber-500/15 text-amber-900 ring-amber-500/30 dark:text-amber-200",
  indigo:
    "bg-indigo-500/15 text-indigo-900 ring-indigo-500/30 dark:text-indigo-200",
  emerald:
    "bg-emerald-500/15 text-emerald-900 ring-emerald-500/30 dark:text-emerald-200",
  rose: "bg-rose-500/15 text-rose-900 ring-rose-500/30 dark:text-rose-200",
  slate: "bg-slate-500/15 text-slate-900 ring-slate-500/30 dark:text-slate-200",
}

export const SHIFT_COLOR_LABELS: Record<ShiftColor, string> = {
  sky: "Mavi",
  amber: "Turuncu",
  indigo: "Lacivert",
  emerald: "Yeşil",
  rose: "Gül",
  slate: "Gri",
}
