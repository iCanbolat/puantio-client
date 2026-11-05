/**
 * Alarm uyarı sinyalleri: kısa sesli bip (Web Audio) ve tarayıcı bildirimi. Desteklenmeyen
 * ortamlarda (eski tarayıcı, test) sessizce atlanır.
 */
export function playAlarmSound(): void {
  const Context = (globalThis as { AudioContext?: typeof AudioContext })
    .AudioContext
  if (!Context) return
  try {
    const context = new Context()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "square"
    oscillator.frequency.value = 880
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.35)
    oscillator.onended = () => {
      void context.close()
    }
  } catch {
    // Tarayıcı otomatik oynatmayı engelleyebilir; görsel uyarı yeterli
  }
}

export function notificationsSupported(): boolean {
  return typeof globalThis.Notification === "function"
}

export function showAlarmNotification(title: string, body: string): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return
  try {
    new Notification(title, { body, tag: "puantio-alarm" })
  } catch {
    // Bazı mobil tarayıcılar yalnızca service worker bildirimine izin verir
  }
}
