import { z } from "zod"

import { http } from "./http"

export const uploadedFileSchema = z.object({ id: z.string(), url: z.string() })
export type UploadedFile = z.infer<typeof uploadedFileSchema>

/** `POST /uploads`: amaç sunucuda yetkiyi ve dosya kuralını belirler */
export function uploadFile(
  file: File,
  purpose: "work_order_photo" | "personnel_doc" | "certificate_doc"
) {
  const body = new FormData()
  body.set("file", file)
  body.set("purpose", purpose)
  return http.post("/uploads", uploadedFileSchema, { body })
}
