import { z } from "zod"

import { brandedId } from "@/shared/types"

/**
 * Organizasyon birimi: lokasyonların üstündeki 1–2 seviye (ör. Bölge → Alt bölge).
 * Seviye adları kiracı terminolojisinden gelir (`terminology.orgLevels`).
 */
export const orgUnitIdSchema = brandedId("OrgUnitId")
export type OrgUnitId = z.infer<typeof orgUnitIdSchema>

export const orgUnitSchema = z.object({
  id: orgUnitIdSchema,
  level: z.number().int().min(0).max(1),
  parentId: orgUnitIdSchema.nullable(),
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean(),
  locationCount: z.number().int().min(0),
})
export type OrgUnit = z.infer<typeof orgUnitSchema>

export const orgUnitListSchema = z.object({ items: z.array(orgUnitSchema) })

export const orgUnitInputSchema = z
  .object({
    level: z.number().int().min(0).max(1),
    parentId: z.string().nullable(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/, "Kod 2–20 karakter: harf, rakam ve tire"),
    name: z.string().trim().min(2, "Ad en az 2 karakter olmalı").max(80),
    isActive: z.boolean(),
  })
  .refine((value) => value.level === 0 || value.parentId !== null, {
    message: "Üst birimi seçin",
    path: ["parentId"],
  })
export type OrgUnitInput = z.infer<typeof orgUnitInputSchema>

export interface OrgTreeNode extends OrgUnit {
  children: OrgTreeNode[]
}

export function buildOrgTree(units: readonly OrgUnit[]): OrgTreeNode[] {
  const nodes = new Map<string, OrgTreeNode>(
    units.map((unit) => [unit.id, { ...unit, children: [] }])
  )
  const roots: OrgTreeNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sort = (list: OrgTreeNode[]) => {
    list.sort((a, b) => a.code.localeCompare(b.code, "tr"))
    for (const node of list) sort(node.children)
  }
  sort(roots)
  return roots
}

/** "Marmara / İstanbul Avrupa" */
export function orgUnitPath(
  units: readonly OrgUnit[],
  id: string | null | undefined
): string {
  const byId = new Map(units.map((unit) => [unit.id as string, unit]))
  const names: string[] = []
  let current = id ? byId.get(id) : undefined
  while (current) {
    names.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return names.join(" / ")
}

/** Birimin kendisi ve tüm alt birimleri (kapsam filtresi için) */
export function descendantIds(
  units: readonly { id: string; parentId: string | null }[],
  rootId: string
): Set<string> {
  const result = new Set<string>([rootId])
  let added = true
  while (added) {
    added = false
    for (const unit of units) {
      if (unit.parentId && result.has(unit.parentId) && !result.has(unit.id)) {
        result.add(unit.id)
        added = true
      }
    }
  }
  return result
}

/** Lokasyonların bağlanabildiği en alt seviye */
export function leafLevel(levelCount: number): number {
  return Math.max(0, levelCount - 1)
}
