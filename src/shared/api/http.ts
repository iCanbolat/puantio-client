import type { z } from "zod"

import { env } from "@/shared/config/env"
import { parseContentDispositionFilename } from "@/shared/lib/download"
import { SERVER_TIME_HEADER, syncServerTime } from "@/shared/lib/server-time"

import {
  ApiError,
  ContractError,
  NetworkError,
  apiErrorBodySchema,
  defaultMessageForStatus,
} from "./errors"

type QueryPrimitive = string | number | boolean
export type QueryValue =
  QueryPrimitive | null | undefined | readonly QueryPrimitive[]
export type QueryParams = Record<string, QueryValue>

export interface HttpConfig {
  baseUrl: string
  timeoutMs: number
  /** Her istekte Authorization başlığı için çağrılır (Faz 1: Keycloak / oidc-client-ts). */
  getAccessToken: () => string | null | Promise<string | null>
  /** 401'de bir kez çağrılır. Yeni token alınabildiyse `true` döner ve istek tekrarlanır. */
  refreshAccessToken: () => Promise<boolean>
  /** Yenileme başarısızsa çağrılır (ör. giriş sayfasına yönlendirme). */
  onUnauthorized: () => void
  /** Her isteğe eklenecek ek başlıklar (ör. platform destek modunda `x-support-tenant`). */
  getHeaders: () => Record<string, string>
}

const defaultConfig: HttpConfig = {
  baseUrl: env.VITE_API_BASE_URL,
  timeoutMs: 30_000,
  getAccessToken: () => null,
  refreshAccessToken: () => Promise.resolve(false),
  onUnauthorized: () => undefined,
  getHeaders: () => ({}),
}

let config: HttpConfig = { ...defaultConfig }

export function configureHttp(partial: Partial<HttpConfig>): void {
  config = { ...config, ...partial }
}

export function resetHttpConfig(): void {
  config = { ...defaultConfig }
}

function getOrigin(): string {
  return typeof window === "undefined"
    ? "http://localhost"
    : window.location.origin
}

/** `baseUrl` + `path` + sorgu parametreleri. Boş/undefined parametreler atlanır. */
export function buildUrl(path: string, params?: QueryParams): string {
  const base = config.baseUrl.replace(/\/+$/, "")
  const suffix = path.startsWith("/") ? path : `/${path}`
  const url = new URL(`${base}${suffix}`, getOrigin())
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue
      if (Array.isArray(value)) {
        for (const item of value as readonly QueryPrimitive[]) {
          url.searchParams.append(key, String(item))
        }
      } else {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

export interface RequestOptions {
  params?: QueryParams
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

let refreshInFlight: Promise<boolean> | null = null

/** Aynı anda gelen 401'ler tek bir yenileme isteğini paylaşır. */
function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= config
    .refreshAccessToken()
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

async function buildHeaders(options: RequestOptions): Promise<Headers> {
  const headers = new Headers({
    Accept: "application/json",
    ...config.getHeaders(),
    ...options.headers,
  })
  const isRawBody =
    options.body instanceof FormData ||
    options.body instanceof Blob ||
    options.body instanceof URLSearchParams
  if (options.body !== undefined && !isRawBody) {
    headers.set("Content-Type", "application/json")
  }
  const token = await config.getAccessToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  return headers
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined
  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams
  ) {
    return body
  }
  return JSON.stringify(body)
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // gövde JSON değil
  }
  const parsed = apiErrorBodySchema.safeParse(payload)
  return new ApiError(
    response.status,
    parsed.success
      ? parsed.data
      : {
          code: `HTTP_${response.status}`,
          message: defaultMessageForStatus(response.status),
        }
  )
}

async function send(
  method: Method,
  path: string,
  options: RequestOptions,
  isRetry = false
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? config.timeoutMs
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.params), {
      method,
      headers: await buildHeaders(options),
      body: serializeBody(options.body),
      signal,
      credentials: "same-origin",
    })
  } catch (error) {
    // Kullanıcı/Query iptali: olduğu gibi fırlat (TanStack Query iptali tanır)
    if (options.signal?.aborted) throw error
    if (timeoutSignal.aborted)
      throw new NetworkError("timeout", { cause: error })
    throw new NetworkError("offline", { cause: error })
  }

  const serverTime = response.headers.get(SERVER_TIME_HEADER)
  if (serverTime) syncServerTime(serverTime)

  if (response.status === 401) {
    if (!isRetry && (await refreshOnce()))
      return send(method, path, options, true)
    config.onUnauthorized()
  }

  if (!response.ok) throw await toApiError(response)
  return response
}

async function parseJson<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
  endpoint: string
): Promise<z.output<TSchema>> {
  const payload: unknown =
    response.status === 204 ? undefined : await response.json()
  const result = schema.safeParse(payload)
  if (!result.success) throw new ContractError(endpoint, result.error)
  return result.data
}

function request<TSchema extends z.ZodType>(
  method: Method,
  path: string,
  schema: TSchema,
  options: RequestOptions = {}
): Promise<z.output<TSchema>> {
  return send(method, path, options).then((response) =>
    parseJson(response, schema, `${method} ${path}`)
  )
}

export interface BlobResponse {
  blob: Blob
  filename: string | null
}

/**
 * Tipli HTTP istemcisi. Her yanıt Zod ile doğrulanır; uymazsa `ContractError` fırlar.
 * Gövdesiz yanıtlar için `z.undefined()` kullanın.
 */
export const http = {
  get: <TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options?: Omit<RequestOptions, "body">
  ) => request("GET", path, schema, options),
  post: <TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options?: RequestOptions
  ) => request("POST", path, schema, options),
  put: <TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options?: RequestOptions
  ) => request("PUT", path, schema, options),
  patch: <TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options?: RequestOptions
  ) => request("PATCH", path, schema, options),
  delete: <TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options?: RequestOptions
  ) => request("DELETE", path, schema, options),
  /** Dosya indirme (bordro export, raporlar). */
  async getBlob(
    path: string,
    options?: Omit<RequestOptions, "body">
  ): Promise<BlobResponse> {
    const response = await send("GET", path, options ?? {})
    return {
      blob: await response.blob(),
      filename: parseContentDispositionFilename(
        response.headers.get("Content-Disposition")
      ),
    }
  },
}
