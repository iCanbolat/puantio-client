import { z } from "zod"

import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { brandedId } from "@/shared/types"

import { cellCodeSchema } from "./cell-code"

export const timesheetPeriodIdSchema = brandedId("TimesheetPeriodId")
export type TimesheetPeriodId = z.infer<typeof timesheetPeriodIdSchema>

/**
 * Dönem yaşam döngüsü: Açık → Bölge onayı → (personel temininde) Müşteri onayı → İK onayı
 * → Kilitli. Kilitli dönemde düzenleme yapılamaz; onaydan sonra yapılan değişiklikler fark
 * listesinde görünür.
 */
export const PERIOD_STATUSES = [
  "open",
  "region_approved",
  "customer_approved",
  "hr_approved",
  "locked",
] as const
export const periodStatusSchema = z.enum(PERIOD_STATUSES)
export type PeriodStatus = z.infer<typeof periodStatusSchema>
export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  open: "Açık",
  region_approved: "Bölge onaylı",
  customer_approved: "Müşteri onaylı",
  hr_approved: "İK onaylı",
  locked: "Kilitli",
}

export const PERIOD_ACTIONS = [
  "approve_region",
  "approve_customer",
  "approve_hr",
  "lock",
  "reopen",
] as const
export const periodActionSchema = z.enum(PERIOD_ACTIONS)
export type PeriodAction = z.infer<typeof periodActionSchema>
export const PERIOD_ACTION_LABELS: Record<PeriodAction, string> = {
  approve_region: "Bölge onayı ver",
  approve_customer: "Müşteri adına onayla",
  approve_hr: "İK onayı ver",
  lock: "Dönemi kilitle",
  reopen: "Dönemi yeniden aç",
}

export const periodHistoryEntrySchema = z.object({
  at: isoDateTimeSchema,
  actor: z.string(),
  action: z.string(),
})

export const periodChangeSchema = z.object({
  at: isoDateTimeSchema,
  actor: z.string(),
  personnelName: z.string(),
  date: isoDateSchema,
  before: cellCodeSchema.nullable(),
  after: cellCodeSchema,
})
export type PeriodChange = z.infer<typeof periodChangeSchema>

export const timesheetPeriodSchema = z.object({
  id: timesheetPeriodIdSchema,
  legalEntityId: z.string(),
  legalEntityTitle: z.string(),
  /** "2026-09" */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  status: periodStatusSchema,
  customerApprovalRequired: z.boolean(),
  personnelCount: z.number().int().min(0),
  history: z.array(periodHistoryEntrySchema),
  /** Bölge onayından sonra yapılan hücre değişiklikleri */
  changes: z.array(periodChangeSchema),
  /** Kullanıcının bu dönemde yapabileceği geçişler (yetki + durum) */
  availableActions: z.array(periodActionSchema),
})
export type TimesheetPeriod = z.infer<typeof timesheetPeriodSchema>
export const timesheetPeriodListSchema = z.object({
  items: z.array(timesheetPeriodSchema),
})

export const timesheetCellSchema = z.object({
  date: isoDateSchema,
  code: cellCodeSchema.nullable(),
  overtimeHours: z.number().min(0),
  nightHours: z.number().min(0),
  holidayWorkHours: z.number().min(0),
  weeklyRestWorkHours: z.number().min(0),
  missingHours: z.number().min(0),
  overridden: z.boolean(),
})
export type TimesheetCell = z.infer<typeof timesheetCellSchema>

export const timesheetSummarySchema = z.object({
  workedDays: z.number(),
  overtimeHours: z.number(),
  absenceDays: z.number(),
  leaveDays: z.number(),
  expectedDays: z.number(),
  unresolvedDays: z.number(),
})

export const timesheetRowSchema = z.object({
  personnelId: z.string(),
  name: z.string(),
  employeeNumber: z.string(),
  locationName: z.string().nullable(),
  cells: z.array(timesheetCellSchema),
  summary: timesheetSummarySchema,
})
export type TimesheetRow = z.infer<typeof timesheetRowSchema>

export const timesheetGridSchema = z.object({
  period: timesheetPeriodSchema,
  days: z.array(isoDateSchema),
  holidays: z.array(
    z.object({
      date: isoDateSchema,
      name: z.string(),
      kind: z.enum(["full", "half"]),
    })
  ),
  rows: z.array(timesheetRowSchema),
})
export type TimesheetGrid = z.infer<typeof timesheetGridSchema>

export const timesheetGridParamsSchema = z.object({
  orgUnitId: z.string().min(1).optional().catch(undefined),
  locationId: z.string().min(1).optional().catch(undefined),
  q: z.string().trim().min(1).optional().catch(undefined),
})
export type TimesheetGridParams = z.infer<typeof timesheetGridParamsSchema>

export const cellUpdateSchema = z.object({
  personnelId: z.string(),
  date: isoDateSchema,
  code: cellCodeSchema,
  overtimeHours: z.number().min(0).max(12),
})
export type CellUpdate = z.infer<typeof cellUpdateSchema>
