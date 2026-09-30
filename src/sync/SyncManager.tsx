import { useEffect } from 'react'
import { useAuth } from '../auth/context'
import { setLocalChangeListener } from '../data/pages'
import { localWorkspaceId } from '../data/workspace'
import { insforge } from '../lib/insforge'
import { insforgePagesApi } from './insforgePagesApi'
import { PagesSyncEngine, adoptLocalPages } from './pagesSync'
import { uploadDirtyDocs } from './registry'
import { useSyncStore } from './syncStore'
import { toast } from '../components/toastStore'
import { cachedWorkspaces, preferredWorkspace, refreshWorkspaces, switchWorkspace } from './workspaceActions'

/**
 * Background sync for the signed-in user. Renders nothing.
 * 1. Bootstrap: resolve the personal workspace, adopt pages made before first contact,
 *    load the workspace list, pick the active workspace (remembered per device).
 * 2. Engine: keep the *active* workspace's page index in sync; restart when it changes.
 * Offline on first launch? Work continues in the on-device workspace until the server is reachable.
 */
export function SyncManager() {
  const { user } = useAuth()
  const uid = user?.id
  const active = useSyncStore((s) => s.workspaceId)

  // 1. Bootstrap
  useEffect(() => {
    if (!uid) return
    const store = useSyncStore.getState()
    const cached = cachedWorkspaces(uid)
    store.setWorkspaces(cached)
    const pref = preferredWorkspace(uid)
    const start = (pref && cached.some((w) => w.id === pref) && pref) || cached.find((w) => w.isPersonal)?.id || localWorkspaceId(uid)
    store.setWorkspace(start)

    let stopped = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const run = async () => {
      const { data, error } = await insforge.database.rpc('ensure_personal_workspace')
      if (stopped) return
      if (error || typeof data !== 'string') {
        store.setPages('offline')
        retry = setTimeout(() => void run(), 5000)
        return
      }
      await adoptLocalPages(localWorkspaceId(uid), data)
      const list = await refreshWorkspaces(uid).catch(() => cachedWorkspaces(uid))
      if (stopped) return
      const current = useSyncStore.getState().workspaceId
      if (!current || current.startsWith('local:') || !list.some((w) => w.id === current)) switchWorkspace(uid, data)
    }
    void run()

    const onOnline = () => {
      useSyncStore.getState().setOnline(true)
      toast.success('Back online — syncing your changes')
      void refreshWorkspaces(uid).catch(() => {})
    }
    const onOffline = () => {
      useSyncStore.getState().setOnline(false)
      toast.info('You’re offline. Keep writing — changes are saved on this device.')
    }
    const onFocus = () => void refreshWorkspaces(uid).catch(() => {})
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('focus', onFocus)
    return () => {
      stopped = true
      clearTimeout(retry)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('focus', onFocus)
    }
  }, [uid])

  // 2. Page-index sync for the active cloud workspace
  useEffect(() => {
    if (!uid || !active || active.startsWith('local:')) return
    let stopped = false
    const engine = new PagesSyncEngine(active, insforgePagesApi, (s) => useSyncStore.getState().setPages(s))
    setLocalChangeListener(() => engine.schedulePush())
    const upload = () => (stopped ? undefined : uploadDirtyDocs(active, () => stopped))
    void engine.start().then(upload)
    const onOnline = () => void engine.sync().then(upload)
    window.addEventListener('online', onOnline)
    return () => {
      stopped = true
      engine.stop()
      setLocalChangeListener(() => {})
      window.removeEventListener('online', onOnline)
    }
  }, [uid, active])

  return null
}
