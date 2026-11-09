import type {
  AuditAnswer,
  AuditItem,
  AuditSection,
  AuditTemplateBody,
} from "../model/audit"

export const isScored = (item: Pick<AuditItem, "type">) => item.type !== "note"

export interface TemplateIssue {
  /** react-hook-form alan yolu ("sections.0.items.1.weight") veya "_weights" */
  path: string
  message: string
}

/** Puanlı maddelerin ağırlık toplamı (formda boş bırakılan ağırlık 0 sayılır) */
export function totalWeight(
  sections: readonly { items: readonly Pick<AuditItem, "type" | "weight">[] }[]
): number {
  return sections
    .flatMap((section) => section.items)
    .filter(isScored)
    .reduce(
      (sum, item) => sum + (Number.isFinite(item.weight) ? item.weight : 0),
      0
    )
}

/**
 * Şablon kuralları (istemci ve sunucu aynı fonksiyonu kullanır):
 * - puanlı maddelerin ağırlık toplamı tam 100,
 * - puanlı maddenin ağırlığı en az 1, not maddesinin ağırlığı 0,
 * - not maddesi kritik olamaz.
 */
export function validateTemplate(
  body: Pick<AuditTemplateBody, "sections">
): TemplateIssue[] {
  const issues: TemplateIssue[] = []
  body.sections.forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => {
      const base = `sections.${sectionIndex}.items.${itemIndex}`
      if (isScored(item) && item.weight < 1)
        issues.push({
          path: `${base}.weight`,
          message: "Puanlı maddenin ağırlığı en az 1",
        })
      if (!isScored(item) && item.weight !== 0)
        issues.push({
          path: `${base}.weight`,
          message: "Not maddesinin ağırlığı 0 olmalı",
        })
      if (!isScored(item) && item.critical)
        issues.push({
          path: `${base}.critical`,
          message: "Not maddesi kritik olamaz",
        })
    })
  })
  const total = totalWeight(body.sections)
  if (total !== 100)
    issues.push({
      path: "_weights",
      message: `Ağırlık toplamı 100 olmalı (şu an ${String(total)})`,
    })
  return issues
}

/** Maddenin 0–1 arası başarı oranı; uygulanamaz/cevapsızsa `null` */
export function itemRatio(
  item: Pick<AuditItem, "type">,
  answer: Pick<AuditAnswer, "passed" | "score"> | undefined
): number | null {
  if (!answer || !isScored(item)) return null
  if (item.type === "score_1_5")
    return answer.score === null ? null : (answer.score - 1) / 4
  return answer.passed === null ? null : answer.passed ? 1 : 0
}

/** Kritik madde başarısız mı: evet/hayırda "hayır", puanda 1 veya 2 */
export function isFailed(
  item: Pick<AuditItem, "type">,
  answer: Pick<AuditAnswer, "passed" | "score"> | undefined
): boolean {
  const ratio = itemRatio(item, answer)
  return ratio !== null && ratio < 0.5
}

export interface AuditScore {
  /** 0–100, bir ondalığa yuvarlanmış; hiç puanlanan madde yoksa 0 */
  score: number
  passed: boolean
  criticalFailures: string[]
  sectionScores: { sectionId: string; score: number | null }[]
}

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * Ağırlıklı puan: Σ(oran × ağırlık) ÷ Σ(cevaplanan maddelerin ağırlığı) × 100. Uygulanamaz
 * maddeler paydadan düşer. Kritik madde başarısızsa puan ne olursa olsun denetim başarısızdır.
 */
export function scoreAudit(
  sections: readonly AuditSection[],
  answers: readonly Pick<AuditAnswer, "itemId" | "passed" | "score">[],
  passScore: number
): AuditScore {
  const byItem = new Map(answers.map((answer) => [answer.itemId, answer]))
  let earned = 0
  let possible = 0
  const criticalFailures: string[] = []
  const sectionScores = sections.map((section) => {
    let sectionEarned = 0
    let sectionPossible = 0
    for (const item of section.items) {
      const answer = byItem.get(item.id)
      const ratio = itemRatio(item, answer)
      if (item.critical && isFailed(item, answer))
        criticalFailures.push(item.id)
      if (ratio === null) continue
      sectionEarned += ratio * item.weight
      sectionPossible += item.weight
    }
    earned += sectionEarned
    possible += sectionPossible
    return {
      sectionId: section.id,
      score:
        sectionPossible === 0
          ? null
          : round1((sectionEarned / sectionPossible) * 100),
    }
  })
  const score = possible === 0 ? 0 : round1((earned / possible) * 100)
  return {
    score,
    passed: score >= passScore && criticalFailures.length === 0,
    criticalFailures,
    sectionScores,
  }
}

/** Kritik başarısız maddelerden açılacak iş emirleri (madde başına bir tane) */
export function workOrdersFromAudit(
  sections: readonly AuditSection[],
  criticalFailures: readonly string[]
): {
  itemId: string
  title: string
  priority: AuditItem["workOrderPriority"]
}[] {
  const failed = new Set(criticalFailures)
  return sections.flatMap((section) =>
    section.items
      .filter((item) => failed.has(item.id))
      .map((item) => ({
        itemId: item.id,
        title: `Denetim: ${item.text}`,
        priority: item.workOrderPriority,
      }))
  )
}
