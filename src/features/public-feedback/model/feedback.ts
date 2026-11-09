import { z } from "zod"

/**
 * Login'siz QR bildirim sayfasının kontratı. Token yanıtı kiracı markasını, alanı ve o alan
 * tipi × hizmet hattına uygun sorun butonlarını taşır; sayfa kiracı yapılandırmasını çekmez.
 */
export const publicFeedbackTargetSchema = z.object({
  tenant: z.object({
    displayName: z.string(),
    shortName: z.string(),
    logoUrl: z.string().nullable(),
    primaryColor: z.string().nullable(),
  }),
  locationName: z.string(),
  area: z
    .object({
      name: z.string(),
      typeLabel: z.string(),
      floor: z.string().nullable(),
    })
    .nullable(),
  /** Kiracı terminolojisi ("Alan", "Nokta") */
  areaTerm: z.string(),
  issues: z.array(z.object({ code: z.string(), label: z.string() })).min(1),
  cooldownMinutes: z.number().int().min(0),
})
export type PublicFeedbackTarget = z.infer<typeof publicFeedbackTargetSchema>

export const feedbackReceiptSchema = z.object({
  reference: z.string(),
  /** Aynı sorun için açık bir iş emrine eklendi mi */
  merged: z.boolean(),
})
export type FeedbackReceipt = z.infer<typeof feedbackReceiptSchema>

export const FEEDBACK_NOTE_MAX = 500
export const FEEDBACK_PHOTO_MAX_BYTES = 5 * 1024 * 1024

export const FEEDBACK_ERROR_CODES = {
  notFound: "TOKEN_NOT_FOUND",
  revoked: "TOKEN_REVOKED",
  cooldown: "COOLDOWN",
} as const
