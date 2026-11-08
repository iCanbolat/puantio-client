import { useState } from "react"

import { SimpleSelect } from "@/shared/components/simple-select"
import { StatusBadge } from "@/shared/components/status-badge"
import { Field, FieldLabel } from "@/shared/ui/field"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import { diffVersions, type DiffKind } from "../domain/version-diff"
import { versionLabel } from "../domain/versions"
import { latestVersion, type ContractVersion } from "../model/contract"

const KIND_LABELS: Record<DiffKind, string> = {
  added: "Eklendi",
  removed: "Çıkarıldı",
  changed: "Değişti",
}
const KIND_TONES = {
  added: "success",
  removed: "danger",
  changed: "info",
} as const

export function VersionCompare({
  versions,
}: {
  versions: readonly ContractVersion[]
}) {
  const options = versions.map((version) => ({
    value: version.id,
    label: `${versionLabel(version.number)} (${version.effectiveFrom})`,
  }))
  const latest = latestVersion(versions)
  const [beforeId, setBeforeId] = useState(versions.at(-2)?.id ?? latest.id)
  const [afterId, setAfterId] = useState(latest.id)
  const before = versions.find((item) => item.id === beforeId) ?? latest
  const after = versions.find((item) => item.id === afterId) ?? latest
  const diff = diffVersions(before, after)

  return (
    <section aria-labelledby="version-compare" className="flex flex-col gap-4">
      <h2 id="version-compare" className="font-heading text-lg font-medium">
        Sürüm karşılaştırma
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="compare-before">Önceki sürüm</FieldLabel>
          <SimpleSelect
            id="compare-before"
            value={beforeId}
            options={options}
            onChange={setBeforeId}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="compare-after">Sonraki sürüm</FieldLabel>
          <SimpleSelect
            id="compare-after"
            value={afterId}
            options={options}
            onChange={setAfterId}
          />
        </Field>
      </div>
      {diff.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sürümler arasında fark yok.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table scrollLabel="Sürüm farkları tablosu">
            <caption className="sr-only">Sürüm farkları</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Bölüm</TableHead>
                <TableHead>Kalem</TableHead>
                <TableHead>Değişiklik</TableHead>
                <TableHead>Önce</TableHead>
                <TableHead>Sonra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diff.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.section}</TableCell>
                  <TableCell>{item.label}</TableCell>
                  <TableCell>
                    <StatusBadge tone={KIND_TONES[item.kind]}>
                      {KIND_LABELS[item.kind]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {item.before ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {item.after ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
