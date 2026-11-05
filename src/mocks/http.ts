import { HttpResponse, type JsonBodyType } from "msw"
import type { z } from "zod"

import { env } from "@/shared/config/env"
import { SERVER_TIME_HEADER } from "@/shared/lib/server-time"
import { searchParamsToObject } from "@/shared/lib/search-params"

import { mockClock } from "./clock"

/**
 * API yolunu MSW eşleşme desenine çevirir.
 *
 * Göreli taban ("/api") tarayıcıda sayfanın origin'ine göre çözülür (MSW varsayılanı);
 * böylece desen yalnızca `<origin>/api/...` ile eşleşir. `*` öneki KULLANILMAZ: "*\/api/*"
 * gibi bir desen geliştirme sunucusundaki `src/shared/api/http.ts` gibi kaynak modüllerini de
 * yakalar ve hata senaryolarında uygulamanın kendi kodunun yüklenmesini bozar.
 */
export function apiPath(path: string): string {
  const base = env.VITE_API_BASE_URL.replace(/\/+$/, "")
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

function withServerTime(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers)
  headers.set(SERVER_TIME_HEADER, mockClock.now().toISOString())
  return { ...init, headers }
}

export function ok(data: JsonBodyType, init?: ResponseInit) {
  return HttpResponse.json(data, withServerTime(init))
}

export function created(data: JsonBodyType) {
  return HttpResponse.json(data, withServerTime({ status: 201 }))
}

export function noContent() {
  return new HttpResponse(null, withServerTime({ status: 204 }))
}

export function problem(
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>
) {
  return HttpResponse.json(
    { code, message, ...(fieldErrors ? { fieldErrors } : {}) },
    withServerTime({ status })
  )
}

export const notFound = (message = "Kayıt bulunamadı.") =>
  problem(404, "NOT_FOUND", message)

export function fileResponse(
  body: BodyInit,
  filename: string,
  contentType: string
) {
  return new HttpResponse(
    body,
    withServerTime({
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  )
}

/** Sorgu parametrelerini istemcinin kullandığı şemayla ayrıştırır. */
export function parseQuery<TSchema extends z.ZodObject>(
  request: Request,
  schema: TSchema
): z.output<TSchema> {
  return schema.parse(searchParamsToObject(new URL(request.url).searchParams))
}

type BodyResult<T> =
  { success: true; data: T } | { success: false; response: Response }

/** İstek gövdesini doğrular; hatalıysa 422 + alan hataları üretir. */
export async function parseBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema
): Promise<BodyResult<z.output<TSchema>>> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return {
      success: false,
      response: problem(400, "INVALID_JSON", "Geçersiz istek gövdesi."),
    }
  }
  const result = schema.safeParse(payload)
  if (result.success) return { success: true, data: result.data }

  const fieldErrors: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_"
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return {
    success: false,
    response: problem(
      422,
      "VALIDATION_FAILED",
      "Formda hatalı alanlar var.",
      fieldErrors
    ),
  }
}
