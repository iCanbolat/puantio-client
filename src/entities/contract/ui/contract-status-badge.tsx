import { StatusBadge } from "@/shared/components/status-badge"

import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  type ContractStatus,
} from "../model/contract"

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <StatusBadge tone={CONTRACT_STATUS_TONES[status]}>
      {CONTRACT_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
