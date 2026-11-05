/** Exhaustive switch kontrolü: yeni bir enum değeri eklendiğinde derleme hatası verir. */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Beklenmeyen değer: ${JSON.stringify(value)}`)
}
