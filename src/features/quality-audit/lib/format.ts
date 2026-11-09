import type { AuditTemplate, AuditTemplateInput } from "../model/audit"

export const formatScore = (score: number) =>
  score.toLocaleString("tr-TR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

/** Şablonu düzenleme/çoğaltma gövdesine çevirir */
export function toTemplateInput(template: AuditTemplate): AuditTemplateInput {
  return {
    name: template.name,
    description: template.description,
    serviceLine: template.serviceLine,
    sectors: template.sectors,
    sections: template.sections,
    isActive: template.isActive,
  }
}
