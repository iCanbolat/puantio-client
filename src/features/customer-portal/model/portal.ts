import { z } from "zod"

import { areaTypeSchema } from "@/entities/location"
import { serviceLineSchema } from "@/entities/tenant"
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SOURCES,
  workOrderSummarySchema,
} from "@/features/work-orders"
import { auditSummarySchema } from "@/features/quality-audit"
import { isoDateTimeSchema } from "@/shared/lib/date"

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
export const monthSchema = z.string().regex(MONTH_PATTERN)

const rateSchema = z.number().min(0).max(1).nullable()

export const portalSummarySchema = z.object({
  customerName: z.string(),
  /** Son 30 gün */
  sla: z.object({
    closed: z.number().int(),
    onTime: z.number().int(),
    rate: rateSchema,
  }),
  openWorkOrders: z.number().int(),
  overdueWorkOrders: z.number().int(),
  audits: z.object({
    count: z.number().int(),
    average: z.number().nullable(),
    passed: z.number().int(),
  }),
  recentOrders: z.array(workOrderSummarySchema),
  recentAudits: z.array(auditSummarySchema),
})
export type PortalSummary = z.infer<typeof portalSummarySchema>

export const requestOptionsSchema = z.object({
  locations: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      serviceLines: z.array(serviceLineSchema),
      areas: z.array(
        z.object({ id: z.string(), name: z.string(), type: areaTypeSchema })
      ),
    })
  ),
  issues: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      serviceLine: serviceLineSchema,
      areaTypes: z.array(areaTypeSchema),
    })
  ),
})
export type RequestOptions = z.infer<typeof requestOptionsSchema>

export const requestReceiptSchema = z.object({
  workOrderId: z.string(),
  number: z.string(),
  merged: z.boolean(),
})

const countRecord = <const T extends readonly string[]>(keys: T) =>
  z.object(
    Object.fromEntries(keys.map((key) => [key, z.number().int()])) as {
      [K in T[number]]: z.ZodNumber
    }
  )

export const monthlyReportSchema = z.object({
  month: monthSchema,
  customerName: z.string(),
  generatedAt: isoDateTimeSchema,
  workOrders: z.object({
    opened: z.number().int(),
    closed: z.number().int(),
    onTime: z.number().int(),
    slaRate: rateSchema,
    /** Kapananların ortalama çözüm süresi (dakika) */
    averageResolutionMinutes: z.number().nullable(),
    openAtMonthEnd: z.number().int(),
    bySource: countRecord(WORK_ORDER_SOURCES),
    byPriority: countRecord(WORK_ORDER_PRIORITIES),
  }),
  audits: z.object({
    count: z.number().int(),
    average: z.number().nullable(),
    passed: z.number().int(),
    criticalFailures: z.number().int(),
    byLocation: z.array(
      z.object({
        locationId: z.string(),
        locationName: z.string(),
        count: z.number().int(),
        average: z.number().nullable(),
      })
    ),
  }),
})
export type MonthlyReport = z.infer<typeof monthlyReportSchema>

export const reportArchiveSchema = z.object({
  items: z.array(
    z.object({
      month: monthSchema,
      /** İçinde bulunulan ay: rapor ay sonunda kesinleşir */
      partial: z.boolean(),
    })
  ),
})

export const REPORT_FREQUENCIES = ["off", "weekly", "monthly"] as const
export const REPORT_FREQUENCY_LABELS: Record<
  (typeof REPORT_FREQUENCIES)[number],
  string
> = {
  off: "Kapalı",
  weekly: "Haftalık (pazartesi)",
  monthly: "Aylık (ayın ilk iş günü)",
}
export const REPORT_SECTIONS = [
  "sla",
  "audits",
  "work_orders",
  "headcount",
] as const
export const REPORT_SECTION_LABELS: Record<
  (typeof REPORT_SECTIONS)[number],
  string
> = {
  sla: "SLA uyumu",
  audits: "Denetim puanları",
  work_orders: "İş emri listesi",
  headcount: "Kadro taahhüdü",
}

export const reportSubscriptionInputSchema = z.object({
  recipients: z
    .array(z.email("Geçerli bir e-posta girin"))
    .min(1, "En az bir alıcı ekleyin")
    .max(10, "En fazla 10 alıcı"),
  frequency: z.enum(REPORT_FREQUENCIES),
  includeSections: z
    .array(z.enum(REPORT_SECTIONS))
    .min(1, "En az bir bölüm seçin"),
})
export type ReportSubscriptionInput = z.infer<
  typeof reportSubscriptionInputSchema
>
export const reportSubscriptionSchema = reportSubscriptionInputSchema.extend({
  recipients: z.array(z.string()),
  updatedAt: isoDateTimeSchema.nullable(),
  updatedBy: z.string().nullable(),
})
export type ReportSubscription = z.infer<typeof reportSubscriptionSchema>
