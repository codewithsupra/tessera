import { db } from '../data/db'
import { insforgePagesApi } from './insforgePagesApi'
import { PagesSyncEngine } from './pagesSync'
import { uploadDirtyDocs } from './registry'

export type FlushResult = { ok: true } | { ok: false; reason: string }

const pending = () => db.pages.filter((p) => !p.workspaceId.startsWith('local:') && (p.dirty === 1 || p.docDirty === 1)).toArray()

/**
 * Pushes every unsynced page and document on this device, in every workspace, right now.
 * Used before a guest is saved and after onboarding seeds sample pages.
 */
export async function flushPendingChanges(): Promise<FlushResult> {
  for (const ws of new Set((await pending()).map((p) => p.workspaceId))) {
    let status = 'syncing'
    const engine = new PagesSyncEngine(ws, insforgePagesApi, (s) => (status = s))
    await engine.sync()
    engine.stop()
    if (status !== 'synced') return { ok: false, reason: `page metadata sync ended ${status} for ${ws}` }
    const failed = await uploadDirtyDocs(ws, () => false)
    if (failed.length) return { ok: false, reason: `document upload ended ${failed.map((f) => `${f.id.slice(0, 8)}:${f.status}`).join(' ')}` }
  }
  const left = await pending()
  if (left.length) return { ok: false, reason: `unsynced after flush: ${left.map((p) => `${p.id.slice(0, 8)}(dirty=${p.dirty},doc=${p.docDirty})`).join(' ')}` }
  return { ok: true }
}
