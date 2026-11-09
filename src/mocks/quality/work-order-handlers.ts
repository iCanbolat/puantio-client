import { http } from "msw"

import { POSITION_LABELS } from "@/entities/personnel"
import {
  applyAction,
  compareUrgency,
  isBreached,
  isOpen,
} from "@/features/work-orders/domain/workflow"
import {
  BOARD_STATUSES,
  WORK_ORDER_ACTION_LABELS,
  createWorkOrderSchema,
  transitionSchema,
  workOrderListParamsSchema,
} from "@/features/work-orders/model/work-order"
import { includesTr } from "@/shared/lib/format"

import { audit, createScope, withAuth, type AuthContext } from "../auth/context"
import { mockClock } from "../clock"
import { db } from "../db"
import type { MockWorkOrder } from "../db/types"
import {
  apiPath,
  created,
  notFound,
  ok,
  parseBody,
  parseQuery,
  problem,
} from "../http"
import { paginate } from "../operations/common"
import { ensureQualityData } from "./seed"
import {
  insertWorkOrder,
  serializeWorkOrder,
  serializeWorkOrderSummary,
  workOrderEvent,
} from "./store"

const BOARD_LIMIT = 200

export function visibleWorkOrders(auth: AuthContext): MockWorkOrder[] {
  ensureQualityData(auth.tenant, mockClock.now())
  const scope = createScope(auth)
  return db.workOrders.findMany(
    (order) =>
      order.tenantId === auth.tenant.slug && scope.locationId(order.locationId)
  )
}

export const isInternal = (auth: AuthContext) => auth.scope.kind !== "customers"

function filterOrders(
  auth: AuthContext,
  params: ReturnType<typeof workOrderListParamsSchema.parse>
) {
  const now = mockClock.now().getTime()
  let items = visibleWorkOrders(auth).filter((order) => {
    if (params.status && order.status !== params.status) return false
    if (params.priority && order.priority !== params.priority) return false
    if (params.source && order.source !== params.source) return false
    if (params.locationId && order.locationId !== params.locationId)
      return false
    if (params.state === "open" && !isOpen(order.status)) return false
    if (
      params.state === "overdue" &&
      !(isOpen(order.status) && isBreached(order, now))
    )
      return false
    return true
  })
  if (params.q) {
    const q = params.q
    items = items.filter((order) => {
      const location = db.locations.findById(order.locationId)
      return (
        includesTr(order.number, q) ||
        includesTr(order.title, q) ||
        includesTr(location?.name ?? "", q) ||
        includesTr(location?.code ?? "", q)
      )
    })
  }
  if (params.sort === "createdAt") {
    const direction = params.order === "asc" ? 1 : -1
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) * direction)
  } else {
    items.sort(compareUrgency(now))
  }
  return items
}

export const workOrderHandlers = [
  http.get(
    apiPath("/work-orders"),
    withAuth("work_order:read", ({ request, auth }) => {
      const params = parseQuery(request, workOrderListParamsSchema)
      const page = paginate(
        filterOrders(auth, params),
        params.page,
        params.pageSize
      )
      return ok({
        items: page.items.map((order) => serializeWorkOrderSummary(order)),
        meta: page.meta,
      })
    })
  ),
  http.get(
    apiPath("/work-orders/board"),
    withAuth("work_order:read", ({ request, auth }) => {
      const params = parseQuery(request, workOrderListParamsSchema)
      const now = mockClock.now().getTime()
      // Panoda kapanan kayıtlar yalnızca son 7 gün
      const items = filterOrders(auth, params).filter(
        (order) =>
          (BOARD_STATUSES as readonly string[]).includes(order.status) &&
          (isOpen(order.status) ||
            now - Date.parse(order.completedAt ?? order.createdAt) <
              7 * 86_400_000)
      )
      return ok({
        items: items
          .slice(0, BOARD_LIMIT)
          .map((order) => serializeWorkOrderSummary(order)),
        truncated: Math.max(0, items.length - BOARD_LIMIT),
      })
    })
  ),
  http.get(
    apiPath("/work-orders/:workOrderId"),
    withAuth("work_order:read", ({ params, auth }) => {
      const order = visibleWorkOrders(auth).find(
        (item) => item.id === params.workOrderId
      )
      return order
        ? ok(serializeWorkOrder(order, { internal: isInternal(auth) }))
        : notFound("İş emri bulunamadı.")
    })
  ),
  http.get(
    apiPath("/work-orders/:workOrderId/assignees"),
    withAuth("work_order:write", ({ request, params, auth }) => {
      const order = visibleWorkOrders(auth).find(
        (item) => item.id === params.workOrderId
      )
      if (!order) return notFound("İş emri bulunamadı.")
      const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
      const items = db.personnel
        .findMany(
          (person) =>
            person.tenantId === auth.tenant.slug &&
            person.status === "active" &&
            (person.homeLocationId === order.locationId || person.isFloater) &&
            (!q || includesTr(`${person.firstName} ${person.lastName}`, q))
        )
        .map((person) => ({
          id: person.id,
          name: `${person.firstName} ${person.lastName}`,
          description: `${POSITION_LABELS[person.position]}${person.isFloater ? " · Yedek havuzu" : ""}`,
          atLocation: person.homeLocationId === order.locationId,
        }))
        .sort(
          (a, b) =>
            Number(b.atLocation) - Number(a.atLocation) ||
            a.name.localeCompare(b.name, "tr")
        )
        .slice(0, 30)
      return ok({ items })
    })
  ),
  http.post(
    apiPath("/work-orders"),
    withAuth("work_order:write", async ({ request, auth }) => {
      const parsed = await parseBody(request, createWorkOrderSchema)
      if (!parsed.success) return parsed.response
      const data = parsed.data
      if (!createScope(auth).locationId(data.locationId))
        return problem(
          422,
          "VALIDATION_FAILED",
          "Lokasyon kapsamınızda değil.",
          {
            locationId: ["Lokasyon kapsamınızda değil"],
          }
        )
      if (data.areaId) {
        const area = db.areas.findById(data.areaId)
        if (area?.locationId !== data.locationId)
          return problem(
            422,
            "VALIDATION_FAILED",
            "Alan bu lokasyona ait değil.",
            {
              areaId: ["Alan bu lokasyona ait değil"],
            }
          )
      }
      const order = insertWorkOrder(auth.tenant, {
        ...data,
        source: "manual",
        categoryCode: null,
        createdAt: mockClock.now().toISOString(),
        actorName: auth.actorName,
        report: {
          receivedAt: mockClock.now().toISOString(),
          channel: "panel",
          issueLabel: data.title,
          note: data.description,
          photoId: null,
        },
      })
      workOrderEvent("work_order.created", order)
      audit(auth, {
        action: "İş emri oluşturuldu",
        targetType: "work_order",
        targetLabel: order.number,
      })
      return created(serializeWorkOrder(order, { internal: true }))
    })
  ),
  http.post(
    apiPath("/work-orders/:workOrderId/transition"),
    withAuth("work_order:write", async ({ request, params, auth }) => {
      const order = visibleWorkOrders(auth).find(
        (item) => item.id === params.workOrderId
      )
      if (!order) return notFound("İş emri bulunamadı.")
      const parsed = await parseBody(request, transitionSchema)
      if (!parsed.success) return parsed.response
      const body = parsed.data
      const next = applyAction(body.action, order.status)
      if (!next)
        return problem(
          409,
          "INVALID_TRANSITION",
          `"${WORK_ORDER_ACTION_LABELS[body.action]}" bu durumda uygulanamaz.`
        )
      const now = mockClock.now().toISOString()
      const patch: Partial<MockWorkOrder> = { status: next }
      if (body.action === "assign") {
        const person = body.assigneeId
          ? db.personnel.findById(body.assigneeId)
          : null
        if (person?.tenantId !== auth.tenant.slug || person.status !== "active")
          return problem(422, "VALIDATION_FAILED", "Personel bulunamadı.", {
            assigneeId: ["Personel bulunamadı"],
          })
        patch.assigneeId = person.id
      }
      if (body.action === "complete") {
        const upload = body.photoId ? db.uploads.findById(body.photoId) : null
        if (upload?.tenantId !== auth.tenant.slug)
          return problem(
            422,
            "VALIDATION_FAILED",
            "Tamamlanma fotoğrafı bulunamadı.",
            {
              photoId: ["Fotoğrafı yeniden yükleyin"],
            }
          )
        patch.completedAt = now
        patch.completionPhotoId = upload.id
        patch.completionNote = body.note ?? null
      }
      if (body.action === "verify") patch.verifiedAt = now
      if (body.action === "reopen") {
        patch.completedAt = null
        patch.completionPhotoId = null
      }
      if (body.action === "cancel") patch.cancelReason = body.note ?? null
      const assigneeName =
        body.action === "assign" && patch.assigneeId
          ? (() => {
              const person = db.personnel.findById(patch.assigneeId)
              return person ? `${person.firstName} ${person.lastName}` : null
            })()
          : null
      const updated = db.workOrders.update(order.id, {
        ...patch,
        history: [
          ...order.history,
          {
            at: now,
            actorName: auth.actorName,
            action:
              body.action === "assign" && assigneeName
                ? `Atandı: ${assigneeName}`
                : WORK_ORDER_ACTION_LABELS[body.action],
            note: body.note ?? null,
          },
        ],
      })!
      workOrderEvent("work_order.updated", updated)
      return ok(serializeWorkOrder(updated, { internal: true }))
    })
  ),
]
