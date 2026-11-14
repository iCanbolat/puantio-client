import {
  COMPLIANCE_LABELS,
  EXPIRY_BUCKET_LABELS,
  TRAINING_STATE_LABELS,
  type ComplianceState,
  type ExpiryBucket,
  type TrainingState,
} from "@/entities/ohs"
import { StatusBadge, type StatusTone } from "@/shared/components/status-badge"

const COMPLIANCE_TONES: Record<ComplianceState, StatusTone> = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  missing: "danger",
}

const TRAINING_TONES: Record<TrainingState, StatusTone> = {
  valid: "success",
  expiring: "warning",
  overdue: "danger",
  never: "danger",
}

const BUCKET_TONES: Record<ExpiryBucket, StatusTone> = {
  expired: "danger",
  d30: "warning",
  d60: "info",
  d90: "neutral",
}

export function ComplianceBadge({ state }: { state: ComplianceState }) {
  return (
    <StatusBadge tone={COMPLIANCE_TONES[state]}>
      {COMPLIANCE_LABELS[state]}
    </StatusBadge>
  )
}

export function TrainingStateBadge({ state }: { state: TrainingState }) {
  return (
    <StatusBadge tone={TRAINING_TONES[state]}>
      {TRAINING_STATE_LABELS[state]}
    </StatusBadge>
  )
}

export function BucketBadge({ bucket }: { bucket: ExpiryBucket | null }) {
  if (!bucket) return <StatusBadge tone="success">Geçerli</StatusBadge>
  return (
    <StatusBadge tone={BUCKET_TONES[bucket]}>
      {EXPIRY_BUCKET_LABELS[bucket]}
    </StatusBadge>
  )
}
