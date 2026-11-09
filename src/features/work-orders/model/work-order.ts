import { z } from "zod"

import { areaTypeSchema } from "@/entities/location"
import { serviceLineSchema } from "@/entities/tenant"
import { isoDateTimeSchema } from "@/shared/lib/date"
import { brandedId, listParamsSchema, paginatedSchema } from "@/shared/types"

export const workOrderIdSchema = brandedId("WorkOrderId")
export type WorkOrderId = z.infer<typeof workOrderIdSchema>

/**
 * İş emri akışı: Yeni → Atandı → Müdahalede → Tamamlandı → Doğrulandı. Kapanmamış iş emri
 * gerekçeyle iptal edilebilir; tamamlanan iş emri doğrulanmazsa müdahaleye geri döner.
 */
export const WORK_ORDER_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "completed",
  "verified",
  "cancelled",
] as const
export const workOrderStatusSchema = z.enum(WORK_ORDER_STATUSES)
export type WorkOrderStatus = z.infer<typeof workOrderStatusSchema>
export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  new: "Yeni",
  assigned: "Atandı",
  in_progress: "Müdahalede",
  completed: "Tamamlandı",
  verified: "Doğrulandı",
  cancelled: "İptal edildi",
}
export const WORK_ORDER_STATUS_TONES = {
  new: "info",
  assigned: "neutral",
  in_progress: "warning",
  completed: "success",
  verified: "success",
  cancelled: "neutral",
} as const satisfies Record<WorkOrderStatus, string>
/** Kanban sütunları (iptal edilenler panoda gösterilmez) */
export const BOARD_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "completed",
  "verified",
] as const satisfies readonly WorkOrderStatus[]
/** SLA sayacının çalıştığı durumlar */
export const OPEN_STATUSES: readonly WorkOrderStatus[] = [
  "new",
  "assigned",
  "in_progress",
]

export const WORK_ORDER_PRIORITIES = [
  "urgent",
  "high",
  "normal",
  "low",
] as const
export const workOrderPrioritySchema = z.enum(WORK_ORDER_PRIORITIES)
export type WorkOrderPriority = z.infer<typeof workOrderPrioritySchema>
export const WORK_ORDER_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  urgent: "Acil",
  high: "Yüksek",
  normal: "Normal",
  low: "Düşük",
}
export const WORK_ORDER_PRIORITY_TONES = {
  urgent: "danger",
  high: "warning",
  normal: "info",
  low: "neutral",
} as const satisfies Record<WorkOrderPriority, string>

export const WORK_ORDER_SOURCES = [
  "qr_feedback",
  "audit_critical",
  "manual",
  "customer_request",
] as const
export const workOrderSourceSchema = z.enum(WORK_ORDER_SOURCES)
export type WorkOrderSource = z.infer<typeof workOrderSourceSchema>
export const WORK_ORDER_SOURCE_LABELS: Record<WorkOrderSource, string> = {
  qr_feedback: "QR bildirimi",
  audit_critical: "Kritik denetim maddesi",
  manual: "Manuel",
  customer_request: "Müşteri talebi",
}

export const WORK_ORDER_ACTIONS = [
  "assign",
  "start",
  "complete",
  "verify",
  "reopen",
  "cancel",
] as const
export const workOrderActionSchema = z.enum(WORK_ORDER_ACTIONS)
export type WorkOrderAction = z.infer<typeof workOrderActionSchema>
export const WORK_ORDER_ACTION_LABELS: Record<WorkOrderAction, string> = {
  assign: "Ata",
  start: "Müdahaleye başla",
  complete: "Tamamla",
  verify: "Doğrula",
  reopen: "Yeniden aç",
  cancel: "İptal et",
}

/** Sorun kataloğu: alan tipi × hizmet hattı. QR sayfasındaki butonlar buradan gelir. */
export const issueCatalogEntrySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, "Yalnızca küçük harf, rakam ve alt çizgi")
    .min(2, "Kod en az 2 karakter")
    .max(40),
  label: z.string().trim().min(2, "Etiketi girin").max(60),
  serviceLine: serviceLineSchema,
  areaTypes: z.array(areaTypeSchema).min(1, "En az bir alan tipi seçin"),
  priority: workOrderPrioritySchema,
  isActive: z.boolean(),
})
export type IssueCatalogEntry = z.infer<typeof issueCatalogEntrySchema>
export const issueCatalogSchema = z
  .object({ items: z.array(issueCatalogEntrySchema) })
  .refine(
    (catalog) =>
      new Set(catalog.items.map((item) => item.code)).size ===
      catalog.items.length,
    { message: "Sorun kodları benzersiz olmalı", path: ["items"] }
  )
export type IssueCatalog = z.infer<typeof issueCatalogSchema>

export const workOrderSummarySchema = z.object({
  id: workOrderIdSchema,
  number: z.string(),
  title: z.string(),
  source: workOrderSourceSchema,
  status: workOrderStatusSchema,
  priority: workOrderPrioritySchema,
  categoryCode: z.string().nullable(),
  serviceLine: serviceLineSchema,
  locationId: z.string(),
  locationCode: z.string(),
  locationName: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  areaId: z.string().nullable(),
  areaName: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  /** Birleştirilen bildirim sayısı (ilk bildirim dahil) */
  reportCount: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  dueAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  /** Yanıt anındaki sunucu saatine göre SLA aşıldı mı (açık iş emirleri için) */
  slaBreached: z.boolean(),
})
export type WorkOrderSummary = z.infer<typeof workOrderSummarySchema>

export const workOrderReportSchema = z.object({
  id: z.string(),
  receivedAt: isoDateTimeSchema,
  channel: z.enum(["qr", "portal", "audit", "panel"]),
  issueLabel: z.string(),
  note: z.string().nullable(),
  photoUrl: z.string().nullable(),
})
export type WorkOrderReport = z.infer<typeof workOrderReportSchema>

export const workOrderEventSchema = z.object({
  at: isoDateTimeSchema,
  actorName: z.string(),
  action: z.string(),
  note: z.string().nullable(),
})

export const workOrderSchema = workOrderSummarySchema.extend({
  description: z.string().nullable(),
  reports: z.array(workOrderReportSchema),
  history: z.array(workOrderEventSchema),
  completionNote: z.string().nullable(),
  completionPhotoUrl: z.string().nullable(),
  verifiedAt: isoDateTimeSchema.nullable(),
  cancelReason: z.string().nullable(),
  auditId: z.string().nullable(),
})
export type WorkOrder = z.infer<typeof workOrderSchema>

export const workOrderListSchema = paginatedSchema(workOrderSummarySchema)
export type WorkOrderList = z.infer<typeof workOrderListSchema>

export const workOrderListParamsSchema = listParamsSchema.extend({
  status: workOrderStatusSchema.optional().catch(undefined),
  priority: workOrderPrioritySchema.optional().catch(undefined),
  source: workOrderSourceSchema.optional().catch(undefined),
  locationId: z.string().min(1).optional().catch(undefined),
  /** `open`: yalnızca kapanmamışlar; `overdue`: SLA aşılmış açık iş emirleri */
  state: z.enum(["open", "overdue"]).optional().catch(undefined),
})
export type WorkOrderListParams = z.infer<typeof workOrderListParamsSchema>

export const workOrderBoardSchema = z.object({
  items: z.array(workOrderSummarySchema),
  /** Panoda gösterilmeyen (sınır aşımı) kayıt sayısı */
  truncated: z.number().int().min(0),
})
export type WorkOrderBoard = z.infer<typeof workOrderBoardSchema>

export const createWorkOrderSchema = z.object({
  title: z.string().trim().min(3, "Başlık en az 3 karakter").max(120),
  description: z.string().trim().max(1000).nullable(),
  locationId: z.string().min(1, "Lokasyon seçin"),
  areaId: z.string().min(1).nullable(),
  priority: workOrderPrioritySchema,
  serviceLine: serviceLineSchema,
})
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>

export const customerRequestSchema = z.object({
  locationId: z.string().min(1, "Lokasyon seçin"),
  areaId: z.string().min(1).nullable(),
  categoryCode: z.string().min(1, "Sorun türünü seçin"),
  note: z.string().trim().max(500, "En fazla 500 karakter").nullable(),
})
export type CustomerRequestInput = z.infer<typeof customerRequestSchema>

export const transitionSchema = z
  .object({
    action: workOrderActionSchema,
    assigneeId: z.string().min(1).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    /** Tamamlama fotoğrafı (yüklenen dosyanın kimliği) */
    photoId: z.string().min(1).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "assign" && !value.assigneeId)
      context.addIssue({
        code: "custom",
        path: ["assigneeId"],
        message: "Atanacak personeli seçin",
      })
    if (value.action === "complete" && !value.photoId)
      context.addIssue({
        code: "custom",
        path: ["photoId"],
        message: "Tamamlanma fotoğrafı zorunlu",
      })
    if (
      (value.action === "cancel" || value.action === "reopen") &&
      (value.note ?? "").trim().length < 5
    )
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Gerekçe en az 5 karakter olmalı",
      })
  })
export type TransitionInput = z.infer<typeof transitionSchema>

export const assigneeOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Aynı lokasyonda çalışan personel önce gelir */
  atLocation: z.boolean(),
})
export const assigneeOptionsSchema = z.object({
  items: z.array(assigneeOptionSchema),
})
export type AssigneeOption = z.infer<typeof assigneeOptionSchema>

export const uploadedFileSchema = z.object({
  id: z.string(),
  url: z.string(),
})
