import { z } from "zod"

import { isoDateSchema, isoDateTimeSchema } from "@/shared/lib/date"
import { brandedId, paginatedSchema, listParamsSchema } from "@/shared/types"

export const alarmIdSchema = brandedId("AlarmId")
export type AlarmId = z.infer<typeof alarmIdSchema>

export const ATTENDANCE_STATUSES = [
  "expected",
  "checked_in",
  "late",
  "no_show",
  "backup_assigned",
  "checked_out",
] as const
export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES)
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  expected: "Bekleniyor",
  checked_in: "Giriş yaptı",
  late: "Geç",
  no_show: "Gelmedi",
  backup_assigned: "Yedek atandı",
  checked_out: "Çıkış yaptı",
}

export const CHECK_METHODS = ["qr", "nfc", "manual"] as const
export const checkMethodSchema = z.enum(CHECK_METHODS)
export type CheckMethod = z.infer<typeof checkMethodSchema>
export const CHECK_METHOD_LABELS: Record<CheckMethod, string> = {
  qr: "QR",
  nfc: "NFC",
  manual: "Manuel",
}

export const ANOMALY_CODES = [
  "outside_geofence",
  "missing_checkout",
  "duplicate_checkin",
  "clock_skew",
  "late_sync",
] as const
export const anomalyCodeSchema = z.enum(ANOMALY_CODES)
export type AnomalyCode = z.infer<typeof anomalyCodeSchema>
export const ANOMALY_LABELS: Record<AnomalyCode, string> = {
  outside_geofence: "Geofence dışı",
  missing_checkout: "Eksik çıkış",
  duplicate_checkin: "Çift giriş",
  clock_skew: "Cihaz saati sapması",
  late_sync: "Geç senkron",
}

export const anomalySchema = z.object({
  code: anomalyCodeSchema,
  /** Örn. "480 m" veya "3 sa 12 dk sonra ulaştı" */
  detail: z.string().nullable(),
})
export type Anomaly = z.infer<typeof anomalySchema>

export const attendanceEventSchema = z.object({
  id: z.string(),
  kind: z.enum(["in", "out"]),
  method: checkMethodSchema,
  /** Cihazın kaydettiği an (offline kuyrukta bekleyebilir) */
  deviceTime: isoDateTimeSchema,
  /** Sunucuya ulaştığı an */
  receivedAt: isoDateTimeSchema,
  offline: z.boolean(),
  geofence: z.object({
    inside: z.boolean(),
    distanceMeters: z.number().min(0),
  }),
  /** İmzalı, kısa ömürlü fotoğraf adresi (önbelleğe alınmaz) */
  photoUrl: z.string().nullable(),
  corrected: z.boolean(),
})
export type AttendanceEvent = z.infer<typeof attendanceEventSchema>

export const liveShiftSchema = z.object({
  shiftId: z.string(),
  personnelId: z.string(),
  personnelName: z.string(),
  employeeNumber: z.string(),
  locationId: z.string(),
  locationName: z.string(),
  orgUnitName: z.string().nullable(),
  code: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  isBackup: z.boolean(),
  status: attendanceStatusSchema,
  lateMinutes: z.number().int().min(0),
  checkIn: attendanceEventSchema.nullable(),
  checkOut: attendanceEventSchema.nullable(),
  anomalies: z.array(anomalySchema),
  alarmId: z.string().nullable(),
})
export type LiveShift = z.infer<typeof liveShiftSchema>

export const liveBoardSchema = z.object({
  date: isoDateSchema,
  items: z.array(liveShiftSchema),
  counts: z.record(attendanceStatusSchema, z.number().int().min(0)),
})
export type LiveBoard = z.infer<typeof liveBoardSchema>

export const liveBoardParamsSchema = z.object({
  orgUnitId: z.string().min(1).optional().catch(undefined),
  locationId: z.string().min(1).optional().catch(undefined),
  status: attendanceStatusSchema.optional().catch(undefined),
  q: z.string().trim().min(1).optional().catch(undefined),
})
export type LiveBoardParams = z.infer<typeof liveBoardParamsSchema>

export const shiftDetailSchema = liveShiftSchema.extend({
  events: z.array(attendanceEventSchema),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    radiusMeters: z.number(),
  }),
})
export type ShiftDetail = z.infer<typeof shiftDetailSchema>

export const ALARM_STATUSES = ["open", "escalated", "resolved"] as const
export const alarmStatusSchema = z.enum(ALARM_STATUSES)
export type AlarmStatus = z.infer<typeof alarmStatusSchema>

export const CLOSE_REASONS = [
  "late_arrival",
  "on_leave",
  "system_error",
  "shift_cancelled",
  "other",
] as const
export const closeReasonSchema = z.enum(CLOSE_REASONS)
export type CloseReason = z.infer<typeof closeReasonSchema>
export const CLOSE_REASON_LABELS: Record<
  CloseReason | "backup_assigned",
  string
> = {
  late_arrival: "Geç geldi",
  on_leave: "İzinli / raporlu",
  system_error: "Sistem veya cihaz hatası",
  shift_cancelled: "Vardiya iptal edildi",
  other: "Diğer",
  backup_assigned: "Yedek atandı",
}

export const alarmSchema = z.object({
  id: alarmIdSchema,
  shiftId: z.string(),
  personnelId: z.string(),
  personnelName: z.string(),
  /** Yalnızca alarm müdahale yetkisinde tam numara döner (arama için) */
  personnelPhone: z.string().nullable(),
  locationId: z.string(),
  locationName: z.string(),
  orgUnitName: z.string().nullable(),
  shiftStartsAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  dueAt: isoDateTimeSchema,
  status: alarmStatusSchema,
  escalatedAt: isoDateTimeSchema.nullable(),
  escalatedTo: z.string().nullable(),
  resolvedAt: isoDateTimeSchema.nullable(),
  resolvedBy: z.string().nullable(),
  resolution: z
    .object({
      reason: z.enum([...CLOSE_REASONS, "backup_assigned"]),
      note: z.string().nullable(),
      backupPersonnelName: z.string().nullable(),
    })
    .nullable(),
  notes: z.array(
    z.object({ at: isoDateTimeSchema, author: z.string(), text: z.string() })
  ),
})
export type Alarm = z.infer<typeof alarmSchema>

export const alarmListSchema = z.object({
  items: z.array(alarmSchema),
  counts: z.object({
    active: z.number().int(),
    escalated: z.number().int(),
    resolvedToday: z.number().int(),
  }),
})
export type AlarmList = z.infer<typeof alarmListSchema>

export const alarmListParamsSchema = z.object({
  durum: z.enum(["aktif", "eskale", "cozulen"]).catch("aktif"),
  orgUnitId: z.string().min(1).optional().catch(undefined),
  locationId: z.string().min(1).optional().catch(undefined),
})
export type AlarmListParams = z.infer<typeof alarmListParamsSchema>

export const backupCandidateSchema = z.object({
  personnelId: z.string(),
  name: z.string(),
  employeeNumber: z.string(),
  isFloater: z.boolean(),
  /** Adayın şu anki/son konumu */
  currentLocationName: z.string().nullable(),
  distanceKm: z.number().min(0),
})
export type BackupCandidate = z.infer<typeof backupCandidateSchema>
export const backupCandidateListSchema = z.object({
  items: z.array(backupCandidateSchema),
})

export const closeAlarmInputSchema = z
  .object({
    reason: closeReasonSchema
      .or(z.literal(""))
      .refine((value) => value !== "", "Kapatma gerekçesi seçin"),
    note: z.string().trim().max(300, "En fazla 300 karakter"),
  })
  .refine((value) => value.reason !== "other" || value.note.length >= 5, {
    message: '"Diğer" gerekçesinde açıklama yazın (en az 5 karakter)',
    path: ["note"],
  })
export type CloseAlarmInput = z.input<typeof closeAlarmInputSchema>

export const alarmNoteInputSchema = z.object({
  text: z.string().trim().min(2, "Not yazın").max(300, "En fazla 300 karakter"),
})

export const attendanceRecordSchema = z.object({
  shiftId: z.string(),
  date: isoDateSchema,
  personnelId: z.string(),
  personnelName: z.string(),
  employeeNumber: z.string(),
  locationName: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  checkIn: attendanceEventSchema.nullable(),
  checkOut: attendanceEventSchema.nullable(),
  anomalies: z.array(anomalySchema),
  corrected: z.boolean(),
})
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>
export const attendanceRecordListSchema = paginatedSchema(
  attendanceRecordSchema
)

export const attendanceRecordParamsSchema = listParamsSchema.extend({
  from: isoDateSchema.optional().catch(undefined),
  to: isoDateSchema.optional().catch(undefined),
  orgUnitId: z.string().min(1).optional().catch(undefined),
  locationId: z.string().min(1).optional().catch(undefined),
  anomaly: anomalyCodeSchema.optional().catch(undefined),
})
export type AttendanceRecordParams = z.infer<
  typeof attendanceRecordParamsSchema
>

export const correctionInputSchema = z.object({
  checkInTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giriş saatini SS:dd biçiminde girin"),
  checkOutTime: z
    .string()
    .regex(
      /^(([01]\d|2[0-3]):[0-5]\d)?$/,
      "Çıkış saatini SS:dd biçiminde girin"
    ),
  reason: z
    .string()
    .trim()
    .min(10, "Gerekçe en az 10 karakter olmalı")
    .max(300),
})
export type CorrectionInput = z.input<typeof correctionInputSchema>

export const correctionPayloadSchema = z.object({
  checkInAt: isoDateTimeSchema,
  checkOutAt: isoDateTimeSchema.nullable(),
  reason: z.string().min(10).max(300),
})
export type CorrectionPayload = z.infer<typeof correctionPayloadSchema>

export const attendanceDashboardSchema = z.object({
  today: z.object({
    expected: z.number().int(),
    present: z.number().int(),
    late: z.number().int(),
    absent: z.number().int(),
    attendanceRate: z.number().min(0).max(1),
  }),
  trend: z.array(
    z.object({
      date: isoDateSchema,
      attendanceRate: z.number().min(0).max(1),
      late: z.number().int(),
      absent: z.number().int(),
    })
  ),
  regions: z.array(
    z.object({
      orgUnitId: z.string(),
      name: z.string(),
      attendanceRate: z.number().min(0).max(1),
      lateRate: z.number().min(0).max(1),
    })
  ),
  sla: z.object({
    alarms: z.number().int(),
    breached: z.number().int(),
    avgResponseMinutes: z.number().min(0),
    slaMinutes: z.number().int(),
  }),
})
export type AttendanceDashboard = z.infer<typeof attendanceDashboardSchema>
