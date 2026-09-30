import { db } from '../data/db'
import { docName } from '../data/docs'
import { fetchMyWorkspaces, type WorkspaceInfo } from '../data/workspaces'
import { useSyncStore } from './syncStore'

/** Removes on-device copies of workspaces the user no longer belongs to (left, removed, deleted). */
export async function purgeLostWorkspaces(keep: Set<string>): Promise<number> {
  const lost = await db.pages.filter((p) => !p.workspaceId.startsWith('local:') && !keep.has(p.workspaceId)).toArray()
  if (!lost.length) return 0
  await db.pages.bulkDelete(lost.map((p) => p.id))
  await Promise.all(
    lost.map(
      (p) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(docName(p.id))
          req.onsuccess = req.onerror = req.onblocked = () => resolve()
        }),
    ),
  )
  return lost.length
}

const listKey = (uid: string) => `tessera:workspaces:${uid}`
const activeKey = (uid: string) => `tessera:active-ws:${uid}`

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable: preferences just won't persist
  }
}

export const cachedWorkspaces = (uid: string) => read<WorkspaceInfo[]>(listKey(uid)) ?? []
export const preferredWorkspace = (uid: string) => read<string>(activeKey(uid))

/** Makes a workspace active and remembers the choice for next launch. */
export function switchWorkspace(uid: string, workspaceId: string) {
  write(activeKey(uid), workspaceId)
  useSyncStore.getState().setWorkspace(workspaceId)
}

/** Reloads the workspace list; if the active one is gone (left/removed/deleted), falls back to personal. */
export async function refreshWorkspaces(uid: string): Promise<WorkspaceInfo[]> {
  const list = await fetchMyWorkspaces()
  write(listKey(uid), list)
  await purgeLostWorkspaces(new Set(list.map((w) => w.id)))
  const store = useSyncStore.getState()
  store.setWorkspaces(list)
  const active = store.workspaceId
  if (active && !active.startsWith('local:') && !list.some((w) => w.id === active)) {
    const personal = list.find((w) => w.isPersonal)
    if (personal) switchWorkspace(uid, personal.id)
  }
  return list
}
