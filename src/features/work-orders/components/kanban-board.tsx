import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  EllipsisVerticalIcon,
  GripVerticalIcon,
  MapPinIcon,
  MessageSquareIcon,
  UserIcon,
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { paths } from "@/shared/config/paths"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

import { actionForDrop, availableActions } from "../domain/workflow"
import {
  BOARD_STATUSES,
  WORK_ORDER_ACTION_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderAction,
  type WorkOrderStatus,
  type WorkOrderSummary,
} from "../model/work-order"
import { WorkOrderPriorityBadge, WorkOrderSla } from "./work-order-ui"

const collisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)

const COLUMN_PREFIX = "col:"

function CardBody({
  order,
  handle,
  menu,
  className,
}: {
  order: WorkOrderSummary
  handle?: ReactNode
  menu?: ReactNode
  className?: string
}) {
  return (
    <article
      aria-label={`${order.number} ${order.title}`}
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs",
        // Renkli zemin metin kontrastını düşürür; vurgu kalın kırmızı kenarlıkla verilir
        order.slaBreached && "border-2 border-red-600 dark:border-red-400",
        className
      )}
    >
      <div className="flex items-start gap-1">
        {handle}
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            to={paths.workOrders.detail(order.id)}
            className="font-mono text-xs text-muted-foreground hover:underline"
          >
            {order.number}
          </Link>
          <span className="font-medium">{order.title}</span>
        </div>
        {menu}
      </div>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{order.locationName}</span>
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <WorkOrderPriorityBadge priority={order.priority} />
        <WorkOrderSla order={order} />
        {order.reportCount > 1 ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquareIcon className="size-3.5" aria-hidden />
            {order.reportCount} bildirim
          </span>
        ) : null}
      </div>
      {order.assigneeName ? (
        <span className="flex items-center gap-1 text-xs">
          <UserIcon className="size-3.5" aria-hidden />
          {order.assigneeName}
        </span>
      ) : null}
    </article>
  )
}

function CardMenu({
  order,
  onAction,
}: {
  order: WorkOrderSummary
  onAction: (order: WorkOrderSummary, action: WorkOrderAction) => void
}) {
  const actions = availableActions(order.status)
  if (actions.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${order.number} işlemleri`}
            onPointerDown={(event) => {
              // Menü düğmesi sürüklemeyi başlatmasın
              event.stopPropagation()
            }}
          />
        }
      >
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{order.number}</DropdownMenuLabel>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action}
              onClick={() => {
                onAction(order, action)
              }}
            >
              {WORK_ORDER_ACTION_LABELS[action]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DraggableCard({
  order,
  canWrite,
  onAction,
}: {
  order: WorkOrderSummary
  canWrite: boolean
  onAction: (order: WorkOrderSummary, action: WorkOrderAction) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
    disabled: !canWrite || order.status === "verified",
  })
  const draggable = canWrite && order.status !== "verified"
  // Sürükleme tutamacı ayrı bir düğmedir: kart içindeki bağlantı ve menü iç içe etkileşimli
  // öğe oluşturmaz (axe nested-interactive)
  return (
    <li
      ref={setNodeRef}
      data-testid={`kart-${order.number}`}
      className={cn("rounded-lg", isDragging && "opacity-40")}
    >
      <CardBody
        order={order}
        handle={
          draggable ? (
            <button
              type="button"
              {...listeners}
              {...attributes}
              aria-roledescription="sürüklenebilir iş emri kartı"
              aria-label={`${order.number} kartını taşı`}
              className="-ml-1 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <GripVerticalIcon className="size-4" aria-hidden />
            </button>
          ) : null
        }
        menu={canWrite ? <CardMenu order={order} onAction={onAction} /> : null}
      />
    </li>
  )
}

function Column({
  status,
  orders,
  canWrite,
  onAction,
}: {
  status: (typeof BOARD_STATUSES)[number]
  orders: WorkOrderSummary[]
  canWrite: boolean
  onAction: (order: WorkOrderSummary, action: WorkOrderAction) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_PREFIX}${status}`,
  })
  const headingId = `kanban-${status}`
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-muted/50 p-2 2xl:w-auto 2xl:min-w-0 2xl:flex-1",
        isOver && "ring-2 ring-ring"
      )}
    >
      <h2
        id={headingId}
        className="flex items-center justify-between px-1 text-sm font-semibold"
      >
        {WORK_ORDER_STATUS_LABELS[status]}
        <span className="rounded-full bg-background px-2 text-xs tabular-nums">
          {orders.length}
        </span>
      </h2>
      <ul className="flex min-h-24 flex-col gap-2">
        {orders.map((order) => (
          <DraggableCard
            key={order.id}
            order={order}
            canWrite={canWrite}
            onAction={onAction}
          />
        ))}
      </ul>
    </section>
  )
}

/**
 * İş emri panosu: sütunlar durumlardır. Kart başka sütuna bırakılınca ilgili eylem diyaloğu
 * açılır (atama, fotoğraflı tamamlama…); geçersiz geçiş engellenir. Dokunmatik ve klavyede
 * kart menüsü aynı eylemleri sunar.
 */
export function KanbanBoard({
  orders,
  canWrite,
  onAction,
}: {
  orders: WorkOrderSummary[]
  canWrite: boolean
  onAction: (order: WorkOrderSummary, action: WorkOrderAction) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )
  const [dragging, setDragging] = useState<WorkOrderSummary | null>(null)
  const byStatus = (status: WorkOrderStatus) =>
    orders.filter((order) => order.status === status)

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null)
    const order = orders.find((item) => item.id === event.active.id)
    const over = event.over?.id
    if (!order || typeof over !== "string" || !over.startsWith(COLUMN_PREFIX))
      return
    const target = over.slice(COLUMN_PREFIX.length) as WorkOrderStatus
    if (target === order.status) return
    const action = actionForDrop(order.status, target)
    if (!action) {
      toast.error(
        `"${WORK_ORDER_STATUS_LABELS[order.status]}" durumundan "${WORK_ORDER_STATUS_LABELS[target]}" durumuna geçilemez.`
      )
      return
    }
    onAction(order, action)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(event) => {
        setDragging(orders.find((item) => item.id === event.active.id) ?? null)
      }}
      onDragCancel={() => {
        setDragging(null)
      }}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Kartı taşımak için boşluk tuşuna basın, ok tuşlarıyla sütun seçin, tekrar boşlukla bırakın. Escape iptal eder.",
        },
      }}
    >
      <div
        role="region"
        aria-label="İş emri panosu"
        className="flex gap-3 overflow-x-auto pb-2"
      >
        {BOARD_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            orders={byStatus(status)}
            canWrite={canWrite}
            onAction={onAction}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <CardBody
            order={dragging}
            className="w-72 cursor-grabbing shadow-lg"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
