import { useQuery } from "@tanstack/react-query"

import { useTerms } from "@/entities/tenant"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"

import { orgUnitQueries } from "../api/org-unit-api"
import { buildOrgTree, type OrgTreeNode } from "../model/org-unit"

const ALL = "__all"

/**
 * Organizasyon birimi seçimi. `leafOnly` ile yalnızca lokasyon bağlanabilen en alt seviye
 * seçilebilir; üst seviyeler grup başlığı olur. Filtre kullanımında "Tümü" seçeneği vardır.
 */
export function OrgUnitSelect({
  value,
  onValueChange,
  leafOnly = false,
  allowAll = false,
  id,
  className,
  "aria-label": ariaLabel,
  invalid,
}: {
  value: string | null
  onValueChange: (value: string | null) => void
  leafOnly?: boolean
  allowAll?: boolean
  id?: string
  className?: string
  "aria-label"?: string
  invalid?: boolean
}) {
  const terms = useTerms()
  const units = useQuery(orgUnitQueries.list())
  const tree = buildOrgTree(units.data ?? [])
  const levelCount = terms.orgLevels.length
  const rootTerm = terms.orgLevels[0]
  const allLabel = `Tüm ${rootTerm ? terms.lower(rootTerm, true) : "birimler"}`

  const flat: { value: string; label: string }[] = []
  const walk = (nodes: OrgTreeNode[], depth: number) => {
    for (const node of nodes) {
      flat.push({ value: node.id, label: `${"— ".repeat(depth)}${node.name}` })
      walk(node.children, depth + 1)
    }
  }
  walk(tree, 0)
  const items = [
    ...(allowAll ? [{ value: ALL, label: allLabel }] : []),
    ...flat,
  ]

  const hasGroups = leafOnly && levelCount > 1

  return (
    <Select
      value={value ?? (allowAll ? ALL : null)}
      onValueChange={(next) => {
        onValueChange(next === ALL || next === null ? null : next)
      }}
      items={items}
    >
      <SelectTrigger
        id={id}
        className={className}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
      >
        <SelectValue placeholder="Seçin" />
      </SelectTrigger>
      <SelectContent>
        {allowAll ? <SelectItem value={ALL}>{allLabel}</SelectItem> : null}
        {hasGroups
          ? tree.map((root) => (
              <SelectGroup key={root.id}>
                <SelectLabel>{root.name}</SelectLabel>
                {root.children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {child.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          : flat.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  )
}
