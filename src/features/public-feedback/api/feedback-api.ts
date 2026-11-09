import { queryOptions } from "@tanstack/react-query"

import { http } from "@/shared/api/http"

import {
  feedbackReceiptSchema,
  publicFeedbackTargetSchema,
} from "../model/feedback"

const enc = encodeURIComponent

export const feedbackKeys = {
  target: (token: string) => ["public-feedback", token] as const,
}

export const feedbackQueries = {
  target: (token: string) =>
    queryOptions({
      queryKey: feedbackKeys.target(token),
      queryFn: ({ signal }) =>
        http.get(`/public/feedback/${enc(token)}`, publicFeedbackTargetSchema, {
          signal,
        }),
      retry: false,
      staleTime: 5 * 60_000,
    }),
}

export function sendFeedback(
  token: string,
  input: {
    issueCode: string
    note: string
    photo: File | null
    requestId: string
    deviceId: string
  }
) {
  const body = new FormData()
  body.set("issueCode", input.issueCode)
  if (input.note.trim()) body.set("note", input.note.trim())
  if (input.photo) body.set("photo", input.photo)
  body.set("requestId", input.requestId)
  body.set("deviceId", input.deviceId)
  return http.post(`/public/feedback/${enc(token)}`, feedbackReceiptSchema, {
    body,
  })
}
