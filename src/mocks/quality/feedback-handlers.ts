import { http } from "msw"

import { AREA_TYPE_LABELS } from "@/entities/location"
import { hasModule } from "@/entities/tenant"
import {
  FEEDBACK_ERROR_CODES,
  FEEDBACK_NOTE_MAX,
  FEEDBACK_PHOTO_MAX_BYTES,
  type PublicFeedbackTarget,
} from "@/features/public-feedback/model/feedback"

import { withAuth } from "../auth/context"
import { mockClock } from "../clock"
import { db } from "../db"
import type { MockArea, MockLocation, MockTag } from "../db/types"
import { apiPath, created, ok, problem } from "../http"
import type { MockTenant } from "../tenancy/tenants"
import { catalogFor, qualityRules, receiveReport, signedFileUrl } from "./store"

interface ResolvedTarget {
  tenant: MockTenant
  tag: MockTag
  location: MockLocation
  area: MockArea | null
}

/**
 * Token → alan/lokasyon. Gerçek backend kiracıyı alan adından çözer; mock'ta token'lar
 * kiracılar arasında benzersizdir.
 */
function resolveToken(token: string): ResolvedTarget | Response {
  const tag = db.tags.findFirst(
    (item) => item.kind === "qr" && item.value === token
  )
  const tenant = tag ? db.tenants.findById(tag.tenantId) : null
  const location = tag ? db.locations.findById(tag.locationId) : null
  if (
    !tag ||
    !tenant ||
    !location ||
    tenant.status !== "active" ||
    !hasModule(tenant, "quality")
  )
    return problem(404, FEEDBACK_ERROR_CODES.notFound, "QR kod tanınmadı.")
  if (tag.status === "revoked")
    return problem(
      410,
      FEEDBACK_ERROR_CODES.revoked,
      "Bu QR kod artık kullanılmıyor."
    )
  const area =
    tag.targetType === "area" ? db.areas.findById(tag.targetId) : null
  return { tenant, tag, location, area: area ?? null }
}

/** Alanın tipine ve lokasyonun hizmet hatlarına uyan etkin sorunlar */
export function issuesFor(target: Omit<ResolvedTarget, "tag">) {
  const catalog = catalogFor(target.tenant.slug).filter(
    (item) =>
      item.isActive && target.location.serviceLines.includes(item.serviceLine)
  )
  const areaType = target.area?.type ?? "lobby"
  const matching = catalog.filter((item) => item.areaTypes.includes(areaType))
  const fallback = catalogFor(target.tenant.slug).filter(
    (item) => item.isActive && item.code === "other"
  )
  return (matching.length > 0 ? matching : fallback).slice(0, 10)
}

export const feedbackHandlers = [
  http.get(apiPath("/public/feedback/:token"), ({ params }) => {
    const resolved = resolveToken(String(params.token))
    if (resolved instanceof Response) return resolved
    const { tenant, location, area } = resolved
    const body: PublicFeedbackTarget = {
      tenant: {
        displayName: tenant.displayName,
        shortName: tenant.shortName,
        logoUrl: tenant.branding.logoUrl,
        primaryColor: tenant.branding.primaryColor,
      },
      locationName: location.name,
      area: area
        ? {
            name: area.name,
            typeLabel: AREA_TYPE_LABELS[area.type],
            floor: area.floor,
          }
        : null,
      areaTerm: tenant.terminology.area.singular,
      issues: issuesFor(resolved).map((item) => ({
        code: item.code,
        label: item.label,
      })),
      cooldownMinutes: qualityRules(tenant).feedbackCooldownMinutes,
    }
    return ok(body)
  }),
  http.post(apiPath("/public/feedback/:token"), async ({ request, params }) => {
    const token = String(params.token)
    const resolved = resolveToken(token)
    if (resolved instanceof Response) return resolved
    const { tenant, location, area } = resolved
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return problem(400, "INVALID_BODY", "Geçersiz istek gövdesi.")
    }
    const text = (name: string) => {
      const value = form.get(name)
      return typeof value === "string" ? value.trim() : ""
    }
    const requestId = text("requestId")
    const deviceId = text("deviceId")
    const issueCode = text("issueCode")
    const note = text("note")
    if (!requestId || !deviceId)
      return problem(422, "VALIDATION_FAILED", "Eksik istek bilgisi.")

    // Aynı istek ikinci kez gelirse (çift tıklama, ağ tekrarı) ilk sonucu döndür
    const previous = db.feedbackSubmissions.findById(requestId)
    if (previous?.token === token) {
      const order = db.workOrders.findById(previous.workOrderId)
      return ok({ reference: order?.number ?? "—", merged: previous.merged })
    }

    const now = mockClock.now()
    const cooldownMs = qualityRules(tenant).feedbackCooldownMinutes * 60_000
    const recent = db.feedbackSubmissions.findFirst(
      (item) =>
        item.token === token &&
        item.deviceId === deviceId &&
        now.getTime() - Date.parse(item.receivedAt) < cooldownMs
    )
    if (recent)
      return problem(
        429,
        FEEDBACK_ERROR_CODES.cooldown,
        "Bu alan için kısa süre önce bildirim gönderdiniz."
      )

    if (!issuesFor(resolved).some((item) => item.code === issueCode))
      return problem(
        422,
        "VALIDATION_FAILED",
        "Lütfen listeden bir sorun seçin.",
        {
          issueCode: ["Geçersiz sorun"],
        }
      )
    if (note.length > FEEDBACK_NOTE_MAX)
      return problem(
        422,
        "VALIDATION_FAILED",
        "Not en fazla 500 karakter olabilir.",
        {
          note: ["En fazla 500 karakter"],
        }
      )
    const photo = form.get("photo")
    let photoId: string | null = null
    if (photo instanceof File) {
      if (
        !photo.type.startsWith("image/") ||
        photo.size > FEEDBACK_PHOTO_MAX_BYTES
      )
        return problem(
          422,
          "VALIDATION_FAILED",
          "Fotoğraf en fazla 5 MB bir görsel olmalı.",
          {
            photo: ["Geçersiz fotoğraf"],
          }
        )
      photoId = `up-${crypto.randomUUID().slice(0, 12)}`
      db.uploads.insert({
        id: photoId,
        tenantId: tenant.slug,
        name: photo.name,
        contentType: photo.type,
        size: photo.size,
        createdAt: now.toISOString(),
      })
    }

    const { order, merged } = receiveReport(tenant, {
      locationId: location.id,
      areaId: area?.id ?? null,
      categoryCode: issueCode,
      channel: "qr",
      note: note || null,
      photoId,
      receivedAt: now.toISOString(),
      actorName: "QR bildirimi",
    })
    db.feedbackSubmissions.insert({
      id: requestId,
      tenantId: tenant.slug,
      token,
      deviceId,
      receivedAt: now.toISOString(),
      workOrderId: order.id,
      merged,
    })
    return created({ reference: order.number, merged })
  }),
  /** Panel ve portal dosya yükleme (iş emri tamamlama fotoğrafı) */
  http.post(
    apiPath("/uploads"),
    withAuth(null, async ({ request, auth }) => {
      if (
        !auth.permissions.has("work_order:write") &&
        !auth.permissions.has("work_order:request")
      )
        return problem(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.")
      const form = await request.formData().catch(() => null)
      const file = form?.get("file")
      if (!(file instanceof File))
        return problem(422, "VALIDATION_FAILED", "Dosya seçin.", {
          file: ["Dosya seçin"],
        })
      if (
        !file.type.startsWith("image/") ||
        file.size > FEEDBACK_PHOTO_MAX_BYTES
      )
        return problem(
          422,
          "VALIDATION_FAILED",
          "En fazla 5 MB bir görsel yükleyin.",
          {
            file: ["Geçersiz dosya"],
          }
        )
      const upload = db.uploads.insert({
        id: `up-${crypto.randomUUID().slice(0, 12)}`,
        tenantId: auth.tenant.slug,
        name: file.name,
        contentType: file.type,
        size: file.size,
        createdAt: mockClock.now().toISOString(),
      })
      return created({
        id: upload.id,
        url: signedFileUrl("quality-photos", upload.id),
      })
    })
  ),
]
