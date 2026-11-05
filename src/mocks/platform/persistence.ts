import { storageKey } from "@/shared/config/brand"

import { db } from "../db"
import type { MockSupportSession } from "../db/types"

/**
 * Mock DB her sayfa açılışında yeniden seed'lenir. Platformdan kiracı adresine geçiş tam sayfa
 * yükleme olduğu için destek oturumları tarayıcıda saklanır (yalnızca mock modu).
 */
const KEY = storageKey("mock-support-sessions")

export function persistSupportSessions(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db.supportSessions.findMany()))
  } catch {
    // depolama yoksa yok say
  }
}

export function restoreSupportSessions(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    for (const session of JSON.parse(raw) as MockSupportSession[]) {
      if (db.supportSessions.findById(session.id))
        db.supportSessions.update(session.id, session)
      else db.supportSessions.insert(session)
    }
  } catch {
    // bozuk kayıt: yok say
  }
}
