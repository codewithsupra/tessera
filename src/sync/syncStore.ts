import { create } from 'zustand'
import type { Role, WorkspaceInfo } from '../data/workspaces'
import type { SyncStatus } from './DocSync'
import type { EngineStatus } from './pagesSync'

type SyncState = {
  /** Active cloud workspace id once known; `local:<uid>` before first contact with the server. */
  workspaceId: string | null
  /** Every workspace the user belongs to (cached for offline). */
  workspaces: WorkspaceInfo[]
  /** The user's role in the active workspace (owner while working locally). */
  role: Role
  pages: EngineStatus
  docs: Record<string, SyncStatus>
  online: boolean
  setWorkspace: (id: string) => void
  setWorkspaces: (list: WorkspaceInfo[]) => void
  setPages: (s: EngineStatus) => void
  setDoc: (pageId: string, s: SyncStatus | null) => void
  setOnline: (online: boolean) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  workspaceId: null,
  workspaces: [],
  role: 'owner',
  pages: 'idle',
  docs: {},
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  setWorkspace: (workspaceId) =>
    set((st) => ({ workspaceId, role: roleIn(st.workspaces, workspaceId) })),
  setWorkspaces: (workspaces) =>
    set((st) => ({ workspaces, role: st.workspaceId ? roleIn(workspaces, st.workspaceId) : st.role })),
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

/** Role in a workspace; the on-device workspace is always yours, unknown ones are read-only until known. */
export function roleIn(list: WorkspaceInfo[], workspaceId: string): Role {
  return list.find((w) => w.id === workspaceId)?.role ?? (workspaceId.startsWith('local:') ? 'owner' : 'viewer')
}

/** One word for the UI, preferring the most attention-worthy state. */
export function summarizeStatus(online: boolean, pages: EngineStatus, doc?: SyncStatus): 'offline' | 'saving' | 'synced' | 'error' {
  if (doc === 'error') return 'error'
  if (!online || doc === 'offline' || pages === 'offline') return 'offline'
  if (doc === 'saving' || doc === 'connecting' || pages === 'syncing') return 'saving'
  return 'synced'
}
