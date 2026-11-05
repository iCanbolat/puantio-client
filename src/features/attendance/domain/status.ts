import { MINUTE_MS } from "@/shared/lib/work-time"

import type { AttendanceStatus } from "../model/attendance"

export interface StatusInput {
  startsAt: Date
  endsAt: Date
  /** Görünür (sunucuya ulaşmış) ilk giriş */
  checkIn: Date | null
  checkOut: Date | null
  hasBackup: boolean
  now: Date
  toleranceMinutes: number
}

/**
 * Vardiyanın canlı durumu. Tolerans içinde giriş yoksa "Gelmedi" (alarm üretilir); tolerans
 * sonrası giriş "Geç" sayılır.
 */
export function deriveAttendanceStatus(input: StatusInput): AttendanceStatus {
  if (input.checkOut) return "checked_out"
  const deadline = input.startsAt.getTime() + input.toleranceMinutes * MINUTE_MS
  if (input.checkIn) {
    return input.checkIn.getTime() > deadline ? "late" : "checked_in"
  }
  if (input.hasBackup) return "backup_assigned"
  return input.now.getTime() >= deadline ? "no_show" : "expected"
}

export function lateMinutes(startsAt: Date, checkIn: Date | null): number {
  if (!checkIn) return 0
  return Math.max(
    0,
    Math.floor((checkIn.getTime() - startsAt.getTime()) / MINUTE_MS)
  )
}

/** Alarm anı: vardiya başlangıcı + tolerans */
export function alarmCreatedAt(startsAt: Date, toleranceMinutes: number): Date {
  return new Date(startsAt.getTime() + toleranceMinutes * MINUTE_MS)
}

export function alarmDueAt(createdAt: Date, slaMinutes: number): Date {
  return new Date(createdAt.getTime() + slaMinutes * MINUTE_MS)
}

/** Çözülmemiş alarm eskalasyon süresini doldurduysa operasyon müdürüne düşer */
export function shouldEscalate(
  createdAt: Date,
  now: Date,
  escalationMinutes: number
): boolean {
  return now.getTime() >= createdAt.getTime() + escalationMinutes * MINUTE_MS
}

/** Pano sıralaması: önce müdahale gerekenler */
export const STATUS_PRIORITY: Record<AttendanceStatus, number> = {
  no_show: 0,
  late: 1,
  expected: 2,
  backup_assigned: 3,
  checked_in: 4,
  checked_out: 5,
}
