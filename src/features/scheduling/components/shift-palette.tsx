import { useDraggable } from "@dnd-kit/core"
import { GripVerticalIcon } from "lucide-react"

import {
  templateNetMinutes,
  templateTimeLabel,
  type ShiftTemplate,
} from "@/entities/shift"
import { cn } from "@/shared/lib/utils"

import { SHIFT_COLOR_CLASSES } from "./shift-colors"

export const TEMPLATE_DRAG_PREFIX = "tpl:"

function PaletteCard({
  template,
  className,
}: {
  template: ShiftTemplate
  className?: string
}) {
  const hours = templateNetMinutes(template) / 60
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ring-1 select-none",
        SHIFT_COLOR_CLASSES[template.color],
        className
      )}
    >
      <GripVerticalIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="font-mono font-semibold">{template.code}</span>
      <span className="truncate">{template.name}</span>
      <span className="ml-auto tabular-nums opacity-80">
        {templateTimeLabel(template)} · {hours.toLocaleString("tr-TR")} sa
      </span>
    </div>
  )
}

function PaletteItem({
  template,
  disabled,
}: {
  template: ShiftTemplate
  disabled: boolean
}) {
  // Kaynak kart yerinde kalır; sürüklenen kopya DragOverlay'de (portal) çizilir.
  // Kartın kendisini transform ile taşımak sayfada yatay taşma yaratıp otomatik
  // kaydırmayı tetikliyor ve bırakma hedefini kaydırıyordu.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${TEMPLATE_DRAG_PREFIX}${template.id}`,
    disabled,
  })
  return (
    <li>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-roledescription="sürüklenebilir vardiya şablonu"
        aria-label={`${template.name} (${template.code}) şablonunu sürükle`}
        data-testid={`palette-${template.code}`}
        className={cn(
          "cursor-grab touch-none rounded-lg",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <PaletteCard
          template={template}
          className={cn(isDragging && "opacity-40")}
        />
      </div>
    </li>
  )
}

/** Sürükleme sırasında işaretçiyi izleyen kart (DragOverlay içinde) */
export function ShiftPaletteDragPreview({
  template,
}: {
  template: ShiftTemplate
}) {
  return (
    <PaletteCard
      template={template}
      className="w-64 cursor-grabbing opacity-90 shadow-lg"
    />
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
