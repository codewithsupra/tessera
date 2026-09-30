import { useEffect } from 'react'
import { useAuth } from '../auth/context'
import { setLocalChangeListener } from '../data/pages'
import { localWorkspaceId } from '../data/workspace'
import { insforge } from '../lib/insforge'
import { insforgePagesApi } from './insforgePagesApi'
import { PagesSyncEngine, adoptLocalPages } from './pagesSync'
import { uploadDirtyDocs } from './registry'
import { useSyncStore } from './syncStore'

const wsKey = (uid: string) => `tessera:ws:${uid}`

function readCachedWorkspace(uid: string): string | null {
  try {
    return localStorage.getItem(wsKey(uid))
  } catch {
    return null
  }
}

/**
 * Runs background sync for the signed-in user. Renders nothing.
 * Offline on first launch? Work continues in the local workspace and is adopted into
 * the cloud workspace the first time the server is reachable.
 */
export function SyncManager() {
  const { user } = useAuth()
  const uid = user?.id

  useEffect(() => {
    if (!uid) return
    const store = useSyncStore.getState()
    const cached = readCachedWorkspace(uid)
    store.setWorkspace(cached ?? localWorkspaceId(uid))

    let stopped = false
    let engine: PagesSyncEngine | null = null

    const run = async () => {
      const { data, error } = await insforge.database.rpc('ensure_personal_workspace')
      if (stopped) return
      if (error || typeof data !== 'string') {
        store.setPages('offline')
        setTimeout(() => !stopped && void run(), 5000)
        return
      }
      const ws = data
      try {
        localStorage.setItem(wsKey(uid), ws)
      } catch {
        // private mode: we'll just ask the server again next launch
      }
      await adoptLocalPages(localWorkspaceId(uid), ws)
      if (stopped) return
      store.setWorkspace(ws)

      engine = new PagesSyncEngine(ws, insforgePagesApi, (s) => useSyncStore.getState().setPages(s))
      setLocalChangeListener(() => engine?.schedulePush())
      await engine.start()
      if (!stopped) await uploadDirtyDocs(ws, () => stopped)
    }
    void run()

    const onOnline = () => {
      useSyncStore.getState().setOnline(true)
      void engine?.sync().then(() => {
        const ws = useSyncStore.getState().workspaceId
        if (ws && !stopped) void uploadDirtyDocs(ws, () => stopped)
      })
    }
    const onOffline = () => useSyncStore.getState().setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      stopped = true
      engine?.stop()
      setLocalChangeListener(() => {})
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [uid])

  return null
}
