import { paths } from "@/shared/config/paths"

/** QR etiketinin açtığı public bildirim adresi (kiracının kendi alt alan adında) */
export function publicFeedbackUrl(token: string): string {
  return `${window.location.origin}${paths.publicFeedback(token)}`
}
