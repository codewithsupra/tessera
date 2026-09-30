import { db } from '../data/db'
import { insforgePagesApi } from './insforgePagesApi'
import { PagesSyncEngine } from './pagesSync'
import { uploadDirtyDocs } from './registry'

/**
 * Pushes every unsynced page and document on this device, in every workspace, right now.
 * Used before a guest is saved and after onboarding seeds sample pages.
 */
export async function flushPendingChanges(): Promise<boolean> {
  const pending = await db.pages.filter((p) => !p.workspaceId.startsWith('local:') && (p.dirty === 1 || p.docDirty === 1)).toArray()
  for (const ws of new Set(pending.map((p) => p.workspaceId))) {
    let status = 'syncing'
    const engine = new PagesSyncEngine(ws, insforgePagesApi, (s) => (status = s))
    await engine.sync()
    engine.stop()
    if (status !== 'synced') return false
    await uploadDirtyDocs(ws, () => false)
  }
  const left = await db.pages.filter((p) => !p.workspaceId.startsWith('local:') && (p.dirty === 1 || p.docDirty === 1)).count()
  return left === 0
}
