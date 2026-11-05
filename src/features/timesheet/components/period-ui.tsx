import { CheckIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"

import { PERIOD_STEPS } from "../domain/period"
import { PERIOD_STATUS_LABELS, type PeriodStatus } from "../model/timesheet"

/** Dönem yaşam döngüsü göstergesi */
export function PeriodStepper({
  status,
  customerApprovalRequired,
}: {
  status: PeriodStatus
  customerApprovalRequired: boolean
}) {
  const steps = PERIOD_STEPS.filter(
    (step) => customerApprovalRequired || step !== "customer_approved"
  )
  const current = steps.indexOf(status)
  return (
    <ol
      className="flex flex-wrap items-center gap-2 text-xs"
      aria-label="Dönem adımları"
    >
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
              done && "border-primary/40 bg-primary/10 text-primary",
              active &&
                "border-primary bg-primary font-medium text-primary-foreground",
              !done && !active && "text-muted-foreground"
            )}
          >
            {done ? (
              <CheckIcon className="size-3" aria-hidden />
            ) : (
              <span className="tabular-nums">{index + 1}</span>
            )}
            {step === "customer_approved"
              ? "Müşteri onayı"
              : step === "open"
                ? "Açık"
                : PERIOD_STATUS_LABELS[step].replace(" onaylı", " onayı")}
          </li>
        )
      })}
    </ol>
  )
}
