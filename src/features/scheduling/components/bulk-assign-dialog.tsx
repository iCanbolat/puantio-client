import { useState } from "react"

import type { RosterMember, ShiftTemplate } from "@/entities/shift"
import { SimpleSelect } from "@/shared/components/simple-select"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/shared/ui/field"
import { Label } from "@/shared/ui/label"

import { expandRotation } from "../domain/board"
import { dayLabel } from "./day-label"

const CLEAR = "__clear__"

/** Seçili satırlara seçili günlerde şablon (veya rotasyon) uygular */
export function BulkAssignDialog({
  open,
  roster,
  selectedRows,
  days,
  templates,
  onApply,
  onClose,
}: {
  open: boolean
  roster: readonly RosterMember[]
  selectedRows: ReadonlySet<string>
  days: readonly string[]
  templates: readonly ShiftTemplate[]
  onApply: (
    cells: { personnelId: string; date: string; templateId: string | null }[]
  ) => void
  onClose: () => void
}) {
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<Set<string>>(
    () => new Set(days)
  )
  const [error, setError] = useState<string | null>(null)
  const options = [
    ...templates
      .filter((template) => template.isActive)
      .map((template) => ({
        value: template.id,
        label: `${template.code} · ${template.name}`,
      })),
    { value: CLEAR, label: "Vardiyaları temizle" },
  ]
  const people = roster.filter((member) => selectedRows.has(member.id))

  const apply = () => {
    if (!templateId) {
      setError("Şablon seçin")
      return
    }
    const chosenDays = days.filter((date) => selectedDays.has(date))
    if (chosenDays.length === 0 || people.length === 0) {
      setError("En az bir personel ve bir gün seçin")
      return
    }
    const template = templates.find((item) => item.id === templateId)
    const cells = people.flatMap((member, memberIndex) => {
      if (template?.kind === "rotation") {
        // Kişileri rotasyonda kaydırarak her gün aynı sayıda kişi çalışır
        const plan = expandRotation(template, chosenDays, memberIndex * 2)
        return chosenDays.map((date) => ({
          personnelId: member.id,
          date,
          templateId: plan.get(date) ?? null,
        }))
      }
      return chosenDays.map((date) => ({
        personnelId: member.id,
        date,
        templateId: templateId === CLEAR ? null : templateId,
      }))
    })
    onApply(cells)
    setError(null)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Toplu atama</DialogTitle>
          <DialogDescription>
            {people.length} personel seçili. Rotasyon şablonu seçilirse (ör. 2
            gündüz – 2 gece – 2 izin) günlere sırayla yayılır.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="bulk-template">Şablon</FieldLabel>
          <SimpleSelect
            id="bulk-template"
            value={templateId}
            onChange={setTemplateId}
            options={options}
            invalid={Boolean(error)}
          />
          <FieldError>{error}</FieldError>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Günler</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {days.map((date) => (
              <div key={date} className="flex items-center gap-2">
                <Checkbox
                  id={`bulk-day-${date}`}
                  checked={selectedDays.has(date)}
                  onCheckedChange={(checked) => {
                    setSelectedDays((current) => {
                      const next = new Set(current)
                      if (checked) next.add(date)
                      else next.delete(date)
                      return next
                    })
                  }}
                />
                <Label htmlFor={`bulk-day-${date}`}>{dayLabel(date)}</Label>
              </div>
            ))}
          </div>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={apply}>Taslağa uygula</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
