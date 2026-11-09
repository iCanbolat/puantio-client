import { StatusBadge } from "@/shared/components/status-badge"

import { formatScore } from "../lib/format"

/** Denetim puanı + sonuç. Kritik bulgu varsa puan yüksek olsa da "Başarısız" */
export function AuditScoreBadge({
  score,
  passed,
  criticalFailures = 0,
}: {
  score: number
  passed: boolean
  criticalFailures?: number
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-semibold tabular-nums">{formatScore(score)}</span>
      <StatusBadge tone={passed ? "success" : "danger"}>
        {passed
          ? "Başarılı"
          : criticalFailures > 0
            ? "Kritik bulgu"
            : "Başarısız"}
      </StatusBadge>
    </span>
  )
}
