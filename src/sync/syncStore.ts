import { create } from 'zustand'
import type { SyncStatus } from './DocSync'
import type { EngineStatus } from './pagesSync'

type SyncState = {
  /** Cloud workspace id once known; `local:<uid>` before first contact with the server. */
  workspaceId: string | null
  pages: EngineStatus
  docs: Record<string, SyncStatus>
  online: boolean
  setWorkspace: (id: string) => void
  setPages: (s: EngineStatus) => void
  setDoc: (pageId: string, s: SyncStatus | null) => void
  setOnline: (online: boolean) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  workspaceId: null,
  pages: 'idle',
  docs: {},
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  setWorkspace: (workspaceId) => set({ workspaceId }),
  setPages: (pages) => set({ pages }),
  setDoc: (pageId, s) =>
    set((st) => {
      const docs = { ...st.docs }
      if (s) docs[pageId] = s
      else delete docs[pageId]
      return { docs }
    }),
  setOnline: (online) => set({ online }),
}))

/** One word for the UI, preferring the most attention-worthy state. */
export function summarizeStatus(online: boolean, pages: EngineStatus, doc?: SyncStatus): 'offline' | 'saving' | 'synced' | 'error' {
  if (doc === 'error') return 'error'
  if (!online || doc === 'offline' || pages === 'offline') return 'offline'
  if (doc === 'saving' || doc === 'connecting' || pages === 'syncing') return 'saving'
  return 'synced'
}
