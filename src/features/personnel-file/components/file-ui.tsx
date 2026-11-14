import { StatusBadge, type StatusTone } from "@/shared/components/status-badge"
import { ProgressBar } from "@/shared/components/progress-bar"

import {
  DOCUMENT_STATE_LABELS,
  type DocumentState,
} from "../model/personnel-file"

const STATE_TONES: Record<DocumentState, StatusTone> = {
  present: "success",
  missing: "danger",
  expired: "warning",
}

export function DocumentStateBadge({ state }: { state: DocumentState }) {
  return (
    <StatusBadge tone={STATE_TONES[state]}>
      {DOCUMENT_STATE_LABELS[state]}
    </StatusBadge>
  )
}

export function CompletionBar({
  value,
  label,
}: {
  value: number
  label: string
}) {
  return (
    <span className="flex min-w-32 items-center gap-2">
      <ProgressBar value={value} max={100} label={label} className="flex-1" />
      <span className="w-10 text-right text-sm tabular-nums">%{value}</span>
    </span>
  )
}
