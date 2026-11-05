import { create } from "zustand"

/**
 * Planlama panosunda kaydedilmemiş atamalar. Kalıcı değildir (sayfa yenilenince kaybolur);
 * kayıt toplu mutation ile yapılır. Anahtar: `${personnelId}|${date}`, değer şablon kimliği
 * veya `null` (o günkü vardiya silinir).
 */
interface PlanningDraftState {
  locationId: string | null
  /** Taslak başladığında sunucudaki plan sürümü (iyimser kilit) */
  baseVersion: number | null
  changes: Record<string, string | null>
  setContext: (locationId: string) => void
  setCells: (
    cells: { personnelId: string; date: string; templateId: string | null }[],
    version: number
  ) => void
  rebase: (version: number) => void
  discard: (keys?: string[]) => void
}

export const draftKey = (personnelId: string, date: string) =>
  `${personnelId}|${date}`

export const usePlanningDraftStore = create<PlanningDraftState>()((set) => ({
  locationId: null,
  baseVersion: null,
  changes: {},
  setContext: (locationId) => {
    set((state) =>
      state.locationId === locationId
        ? state
        : { locationId, baseVersion: null, changes: {} }
    )
  },
  setCells: (cells, version) => {
    set((state) => {
      const changes = { ...state.changes }
      for (const cell of cells) {
        changes[draftKey(cell.personnelId, cell.date)] = cell.templateId
      }
      return { changes, baseVersion: state.baseVersion ?? version }
    })
  },
  rebase: (version) => {
    set({ baseVersion: version })
  },
  discard: (keys) => {
    set((state) => {
      if (!keys) return { changes: {}, baseVersion: null }
      const changes = { ...state.changes }
      for (const key of keys) {
        Reflect.deleteProperty(changes, key)
      }
      return {
        changes,
        baseVersion: Object.keys(changes).length > 0 ? state.baseVersion : null,
      }
    })
  },
}))
