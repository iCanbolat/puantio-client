import { z } from "zod"

/** Backend hata gövdesi sözleşmesi (RFC 7807'den sadeleştirilmiş). */
export const apiErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string().optional(),
})
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>

/** HTTP hata yanıtı (4xx/5xx). */
export class ApiError extends Error {
  override readonly name = "ApiError"
  readonly status: number
  readonly code: string
  readonly fieldErrors: Readonly<Record<string, string[]>> | undefined
  readonly requestId: string | undefined

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.status = status
    this.code = body.code
    this.fieldErrors = body.fieldErrors
    this.requestId = body.requestId
  }
}

/** Sunucu yanıtı beklenen Zod şemasına uymadı: API kontratı kaymış demektir. */
export class ContractError extends Error {
  override readonly name = "ContractError"
  readonly endpoint: string
  readonly issues: readonly z.core.$ZodIssue[]

  constructor(endpoint: string, error: z.ZodError) {
    super(`API kontrat hatası (${endpoint}):\n${z.prettifyError(error)}`)
    this.endpoint = endpoint
    this.issues = error.issues
  }
}

export type NetworkErrorReason = "offline" | "timeout"

/** Sunucuya ulaşılamadı (bağlantı yok, zaman aşımı). */
export class NetworkError extends Error {
  override readonly name = "NetworkError"
  readonly reason: NetworkErrorReason

  constructor(reason: NetworkErrorReason, options?: ErrorOptions) {
    super(
      reason === "timeout"
        ? "İstek zaman aşımına uğradı"
        : "Sunucuya ulaşılamıyor",
      options
    )
    this.reason = reason
  }
}

export type AppError = ApiError | ContractError | NetworkError | Error

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof ApiError

export const isContractError = (error: unknown): error is ContractError =>
  error instanceof ContractError

export const isNetworkError = (error: unknown): error is NetworkError =>
  error instanceof NetworkError

const STATUS_MESSAGES: Record<number, string> = {
  400: "İstek geçersiz.",
  401: "Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.",
  403: "Bu işlem için yetkiniz yok.",
  404: "Kayıt bulunamadı.",
  409: "Kayıt başka bir kullanıcı tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.",
  422: "Formda hatalı alanlar var.",
  429: "Çok fazla istek gönderildi. Lütfen biraz bekleyin.",
}

/** Kullanıcıya gösterilecek Türkçe hata mesajı. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return "Sunucuda bir hata oluştu. Lütfen tekrar deneyin."
    }
    if (error.message) return error.message
    return STATUS_MESSAGES[error.status] ?? "Beklenmeyen bir hata oluştu."
  }
  if (error instanceof ContractError) {
    return "Sunucudan beklenmeyen bir yanıt alındı. Teknik ekip bilgilendirildi."
  }
  if (error instanceof NetworkError) {
    return error.reason === "timeout"
      ? "Sunucu zamanında yanıt vermedi. Lütfen tekrar deneyin."
      : "Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin."
  }
  return "Beklenmeyen bir hata oluştu."
}

export function defaultMessageForStatus(status: number): string {
  return STATUS_MESSAGES[status] ?? "Beklenmeyen bir hata oluştu."
}
