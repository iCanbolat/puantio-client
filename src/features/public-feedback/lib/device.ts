import { storageKey } from "@/shared/config/brand"

/**
 * Public sayfa zustand/safe-storage çekmez (hafif chunk); localStorage erişimi burada
 * try/catch ile sarılır. KVKK: yalnızca rastgele cihaz kimliği ve son gönderim zamanı
 * tutulur, kişisel veri yazılmaz.
 */
function read(name: string): string | null {
  try {
    return localStorage.getItem(name)
  } catch {
    return null
  }
}

function write(name: string, value: string): void {
  try {
    localStorage.setItem(name, value)
  } catch {
    // gizli sekme / kota: bekleme süresi yalnızca sunucuda uygulanır
  }
}

const DEVICE_KEY = storageKey("feedback-device")
const cooldownKey = (token: string) => storageKey(`feedback-sent.${token}`)

export function deviceId(): string {
  const existing = read(DEVICE_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  write(DEVICE_KEY, created)
  return created
}

export function markSent(token: string, at: number): void {
  write(cooldownKey(token), String(at))
}

/** Bekleme süresi bitmediyse kalan milisaniye, aksi halde 0 */
export function cooldownRemaining(
  token: string,
  cooldownMinutes: number,
  now: number
): number {
  const sentAt = Number(read(cooldownKey(token)))
  if (!Number.isFinite(sentAt) || sentAt <= 0) return 0
  return Math.max(0, sentAt + cooldownMinutes * 60_000 - now)
}
