import type { RequirementResult, TrainingState } from "@/entities/ohs"

import type { AuditPackRow } from "../model/ohs"

export interface AuditPackPerson {
  personnelId: string
  name: string
  position: string
  trainings: { typeName: string; state: TrainingState; dueAt: string | null }[]
  requirements: RequirementResult[]
  /** Sağlık gözetimi sonucu; pakete yalnızca "fit" ve kiracı izin verdiyse girer */
  healthResult: "fit" | "conditional" | "unfit" | null
}

const OK_CERT = new Set(["valid", "expiring"])
const OK_TRAINING = new Set(["valid", "expiring"])

/** Uygunluk: tüm zorunlu sertifikalar ve eğitimler geçerli (sağlık uygunluğu hesaba katılmaz) */
export function isCompliant(
  person: Pick<AuditPackPerson, "trainings" | "requirements">
): boolean {
  return (
    person.requirements.every((item) => OK_CERT.has(item.state)) &&
    person.trainings.every((item) => OK_TRAINING.has(item.state))
  )
}

/**
 * Müşteri denetim paketi satırları. KVKK: sağlık için yalnızca "Uygun" bilgisi, o da
 * kiracı ayarı açıksa; tarih, sonuç türü veya aşı bilgisi asla pakete girmez.
 */
export function buildAuditPackRows(
  people: readonly AuditPackPerson[],
  includeHealth: boolean
): { rows: AuditPackRow[]; summary: { total: number; compliant: number } } {
  const rows = [...people]
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map((person): AuditPackRow => ({
      personnelId: person.personnelId,
      name: person.name,
      position: person.position,
      trainings: person.trainings,
      certificates: person.requirements.map((item) => ({
        type: item.type,
        state: item.state,
        expiresAt: item.expiresAt,
      })),
      health: includeHealth && person.healthResult === "fit" ? "fit" : null,
      compliant: isCompliant(person),
    }))
  return {
    rows,
    summary: {
      total: rows.length,
      compliant: rows.filter((row) => row.compliant).length,
    },
  }
}
