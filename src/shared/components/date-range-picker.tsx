import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns"
import { CalendarIcon, XIcon } from "lucide-react"
import { useState } from "react"
import type { DateRange } from "react-day-picker"
import { tr } from "react-day-picker/locale"

import { useMediaQuery } from "@/shared/hooks/use-media-query"
import { toIsoDate } from "@/shared/lib/date"
import { formatIsoRange, type IsoDateRange } from "@/shared/lib/date-range"
import { serverNow } from "@/shared/lib/server-time"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Calendar } from "@/shared/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"

/** "2026-09-01" → yerel gece yarısı Date (takvim bileşeni yerel tarihle çalışır). */
function fromIso(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

const toIso = (date: Date | undefined) =>
  date ? format(date, "yyyy-MM-dd") : undefined

/** Ön tanımlar İstanbul'daki "bugün"e göre hesaplanır. */
function todayLocal(): Date {
  const iso = toIsoDate(serverNow())
  return fromIso(iso) ?? new Date()
}

const PRESETS: { label: string; range: () => { from: Date; to: Date } }[] = [
  { label: "Bugün", range: () => ({ from: todayLocal(), to: todayLocal() }) },
  {
    label: "Dün",
    range: () => ({
      from: subDays(todayLocal(), 1),
      to: subDays(todayLocal(), 1),
    }),
  },
  {
    label: "Son 7 gün",
    range: () => ({ from: subDays(todayLocal(), 6), to: todayLocal() }),
  },
  {
    label: "Son 30 gün",
    range: () => ({ from: subDays(todayLocal(), 29), to: todayLocal() }),
  },
  {
    label: "Bu ay",
    range: () => ({ from: startOfMonth(todayLocal()), to: todayLocal() }),
  },
  {
    label: "Geçen ay",
    range: () => {
      const previous = subMonths(todayLocal(), 1)
      return { from: startOfMonth(previous), to: endOfMonth(previous) }
    },
  },
]

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Tarih aralığı",
  label = "Tarih aralığı",
  className,
}: {
  value: IsoDateRange
  onChange: (value: IsoDateRange) => void
  placeholder?: string
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const isWide = useMediaQuery("(min-width: 768px)")
  const selected: DateRange | undefined = value.from
    ? { from: fromIso(value.from), to: fromIso(value.to) }
    : undefined
  const text = formatIsoRange(value)

  return (
    <div className={cn("flex items-center", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={text ? `${label}: ${text}` : label}
              className={cn(
                "justify-start font-normal",
                !text && "text-muted-foreground"
              )}
            />
          }
        >
          <CalendarIcon data-icon="inline-start" />
          {text ?? placeholder}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-wrap gap-1 border-b p-2 sm:w-36 sm:flex-col sm:border-r sm:border-b-0">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    const range = preset.range()
                    onChange({ from: toIso(range.from), to: toIso(range.to) })
                    setOpen(false)
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <Calendar
              mode="range"
              locale={tr}
              numberOfMonths={isWide ? 2 : 1}
              defaultMonth={selected?.from ?? todayLocal()}
              selected={selected}
              onSelect={(range) => {
                onChange({ from: toIso(range?.from), to: toIso(range?.to) })
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
      {text ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${label} filtresini temizle`}
          onClick={() => {
            onChange({})
          }}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  )
}
