import { z } from "zod"

import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { isTimeOfDay, segmentMinutes } from "@/shared/lib/work-time"
import { brandedId } from "@/shared/types"

/**
 * Vardiya şablonu ve ataması. Modül 1'in (vardiya, yoklama, puantaj) ortak çekirdeği:
 * planlama panosu atama üretir, saha uygulaması atamaya giriş yapar, puantaj atama + giriş +
 * izin + tatilden gün kodu üretir.
 */
export const shiftTemplateIdSchema = brandedId("ShiftTemplateId")
export type ShiftTemplateId = z.infer<typeof shiftTemplateIdSchema>

export const shiftAssignmentIdSchema = brandedId("ShiftAssignmentId")
export type ShiftAssignmentId = z.infer<typeof shiftAssignmentIdSchema>

export const timeOfDaySchema = z
  .string()
  .refine(isTimeOfDay, "Saat SS:dd biçiminde olmalı")

export const timeSegmentSchema = z.object({
  start: timeOfDaySchema,
  end: timeOfDaySchema,
})
export type ShiftSegment = z.infer<typeof timeSegmentSchema>

export const SHIFT_TEMPLATE_KINDS = ["standard", "split", "rotation"] as const
export const shiftTemplateKindSchema = z.enum(SHIFT_TEMPLATE_KINDS)
export type ShiftTemplateKind = z.infer<typeof shiftTemplateKindSchema>
export const SHIFT_TEMPLATE_KIND_LABELS: Record<ShiftTemplateKind, string> = {
  standard: "Tek parça",
  split: "Parçalı",
  rotation: "Rotasyon",
}

export const SHIFT_COLORS = [
  "sky",
  "amber",
  "indigo",
  "emerald",
  "rose",
  "slate",
] as const
export const shiftColorSchema = z.enum(SHIFT_COLORS)
export type ShiftColor = z.infer<typeof shiftColorSchema>

/** Rotasyon adımı: bir şablon kimliği veya izin günü */
export const rotationStepSchema = z.union([
  z.object({ kind: z.literal("shift"), templateId: shiftTemplateIdSchema }),
  z.object({ kind: z.literal("off") }),
])
export type RotationStep = z.infer<typeof rotationStepSchema>

export const shiftTemplateSchema = z.object({
  id: shiftTemplateIdSchema,
  /** Panoda hücrede görünen kısa kod: "S", "A", "G12" */
  code: z.string().min(1).max(4),
  name: z.string().min(1),
  kind: shiftTemplateKindSchema,
  /** Rotasyon şablonunda boş; parçalı vardiyada birden fazla */
  segments: z.array(timeSegmentSchema),
  breakMinutes: z.number().int().min(0).max(180),
  color: shiftColorSchema,
  /** Yalnızca rotasyon: ör. 2 gündüz – 2 gece – 2 izin */
  rotation: z.array(rotationStepSchema).nullable(),
  isActive: z.boolean(),
})
export type ShiftTemplate = z.infer<typeof shiftTemplateSchema>
export const shiftTemplateListSchema = z.object({
  items: z.array(shiftTemplateSchema),
})

/** Şablonun net çalışma süresi (dakika): parçalar toplamı − mola */
export function templateNetMinutes(
  template: Pick<ShiftTemplate, "segments" | "breakMinutes">
): number {
  const gross = template.segments.reduce(
    (sum, segment) => sum + segmentMinutes(segment),
    0
  )
  return Math.max(0, gross - template.breakMinutes)
}

export function templateTimeLabel(
  template: Pick<ShiftTemplate, "segments">
): string {
  return template.segments
    .map((segment) => `${segment.start}–${segment.end}`)
    .join(" + ")
}

export const shiftTemplateInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Kısa kod girin")
      .max(4, "En fazla 4 karakter"),
    name: z.string().trim().min(2, "Şablon adını girin").max(60),
    kind: z.enum(["standard", "split"]),
    segments: z
      .array(timeSegmentSchema)
      .min(1, "En az bir zaman aralığı girin")
      .max(3),
    breakMinutes: z
      .number({ error: "Mola süresini girin" })
      .int()
      .min(0, "Mola negatif olamaz")
      .max(180, "Mola en fazla 180 dk"),
    color: shiftColorSchema,
  })
  .refine((value) => value.kind === "split" || value.segments.length === 1, {
    message: "Tek parça vardiyada yalnızca bir aralık olur",
    path: ["segments"],
  })
  .refine((value) => templateNetMinutes(value) > 0, {
    message: "Net çalışma süresi sıfırdan büyük olmalı",
    path: ["breakMinutes"],
  })
export type ShiftTemplateInput = z.input<typeof shiftTemplateInputSchema>
export type ShiftTemplatePayload = z.output<typeof shiftTemplateInputSchema>

export const ASSIGNMENT_KINDS = ["regular", "backup"] as const
export const assignmentKindSchema = z.enum(ASSIGNMENT_KINDS)
export type AssignmentKind = z.infer<typeof assignmentKindSchema>

export const shiftAssignmentSchema = z.object({
  id: shiftAssignmentIdSchema,
  personnelId: z.string(),
  locationId: z.string(),
  locationName: z.string(),
  /** Vardiyanın başladığı takvim günü */
  date: isoDateSchema,
  templateId: shiftTemplateIdSchema.nullable(),
  code: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  breakMinutes: z.number().int().min(0),
  kind: assignmentKindSchema,
})
export type ShiftAssignment = z.infer<typeof shiftAssignmentSchema>

export const rosterMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  employeeNumber: z.string(),
  position: z.string(),
  isFloater: z.boolean(),
  /** Yıl başından bu yana fazla mesai (saat) — yıllık sınır kontrolü */
  overtimeHoursYtd: z.number().min(0),
})
export type RosterMember = z.infer<typeof rosterMemberSchema>

export const scheduleLeaveSchema = z.object({
  id: z.string(),
  personnelId: z.string(),
  type: z.string(),
  typeLabel: z.string(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  status: z.enum(["pending", "approved"]),
})
export type ScheduleLeave = z.infer<typeof scheduleLeaveSchema>

/**
 * Lokasyon planı. `assignments` ekip üyelerinin aralık ±7 gün içindeki **tüm** atamalarını
 * içerir (başka lokasyondakiler dahil): çakışma, dinlenme ve haftalık süre kuralları için.
 */
export const locationScheduleSchema = z.object({
  location: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    targetHeadcount: z.number().int().min(0),
  }),
  from: isoDateSchema,
  to: isoDateSchema,
  /** İyimser kilit: kayıtta gönderilir, başkası değiştirdiyse 409 */
  version: z.number().int().min(0),
  roster: z.array(rosterMemberSchema),
  assignments: z.array(shiftAssignmentSchema),
  leaves: z.array(scheduleLeaveSchema),
  holidays: z.array(
    z.object({
      date: isoDateSchema,
      name: z.string(),
      kind: z.enum(["full", "half"]),
    })
  ),
})
export type LocationSchedule = z.infer<typeof locationScheduleSchema>

export const scheduleChangeSchema = z.object({
  personnelId: z.string(),
  date: isoDateSchema,
  /** `null`: o günkü atama silinir */
  templateId: z.string().nullable(),
})
export type ScheduleChange = z.infer<typeof scheduleChangeSchema>

export const scheduleBatchSchema = z.object({
  locationId: z.string(),
  version: z.number().int().min(0),
  force: z.boolean().optional(),
  changes: z.array(scheduleChangeSchema).min(1).max(2000),
})
export type ScheduleBatch = z.infer<typeof scheduleBatchSchema>

export const scheduleBatchResultSchema = z.object({
  version: z.number().int(),
  applied: z.number().int(),
})

export const personnelShiftsSchema = z.object({
  items: z.array(shiftAssignmentSchema),
})
