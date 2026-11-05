import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon } from "lucide-react"

import {
  templateNetMinutes,
  templateTimeLabel,
  type ShiftTemplate,
} from "@/entities/shift"
import { cn } from "@/shared/lib/utils"

import { SHIFT_COLOR_CLASSES } from "./shift-colors"

export const TEMPLATE_DRAG_PREFIX = "tpl:"

function PaletteItem({
  template,
  disabled,
}: {
  template: ShiftTemplate
  disabled: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `${TEMPLATE_DRAG_PREFIX}${template.id}`,
      disabled,
    })
  const hours = templateNetMinutes(template) / 60
  return (
    <li>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform) }}
        {...listeners}
        {...attributes}
        aria-roledescription="sürüklenebilir vardiya şablonu"
        aria-label={`${template.name} (${template.code}) şablonunu sürükle`}
        data-testid={`palette-${template.code}`}
        className={cn(
          "flex cursor-grab touch-none items-center gap-2 rounded-lg px-2 py-1.5 text-xs ring-1 select-none",
          SHIFT_COLOR_CLASSES[template.color],
          isDragging && "z-50 opacity-80 shadow-lg",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <GripVerticalIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="font-mono font-semibold">{template.code}</span>
        <span className="truncate">{template.name}</span>
        <span className="ml-auto tabular-nums opacity-80">
          {templateTimeLabel(template)} · {hours.toLocaleString("tr-TR")} sa
        </span>
      </div>
    </li>
  )
}

/** Sürüklenebilir şablon paleti (rotasyon şablonları toplu atamada kullanılır) */
export function ShiftPalette({
  templates,
  disabled,
}: {
  templates: readonly ShiftTemplate[]
  disabled: boolean
}) {
  const items = templates.filter(
    (template) => template.isActive && template.kind !== "rotation"
  )
  return (
    <section aria-label="Vardiya şablonları" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Şablonlar</h2>
      <p className="text-xs text-muted-foreground">
        Şablonu hücreye sürükleyin veya hücreye tıklayıp seçin.
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((template) => (
          <PaletteItem
            key={template.id}
            template={template}
            disabled={disabled}
          />
        ))}
      </ul>
    </section>
  )
}
