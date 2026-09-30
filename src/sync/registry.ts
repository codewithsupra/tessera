import type * as Y from 'yjs'
import { db } from '../data/db'
import { openDoc } from '../data/docs'
import { DocSync } from './DocSync'
import { insforgeTransport } from './insforgeTransport'
import { useSyncStore } from './syncStore'
import type { DocTransport } from './transport'

/**
 * One DocSync per open page, shared by the editor and the background uploader
 * (realtime subscriptions are per channel, so two syncs on one page would fight).
 */
type Entry = { doc: Y.Doc; refs: number; release: () => void; localReady: Promise<DocSync>; ready: Promise<DocSync> }
const live = new Map<string, Entry>()

let transport: DocTransport = insforgeTransport
/** Tests swap in a fake transport. */
export function setTransport(t: DocTransport) {
  transport = t
}

export type SyncHandle = {
  doc: Y.Doc
  /** Resolves once the on-device copy has loaded — safe to render. */
  localReady: Promise<DocSync>
  /** Resolves after the first server sync attempt (success or offline). */
  ready: Promise<DocSync>
  release: () => Promise<void>
}

export function acquireSync(pageId: string): SyncHandle {
  let e = live.get(pageId)
  if (!e) {
    const handle = openDoc(pageId)
    // Create the sync only after IndexedDB has loaded: otherwise the load itself looks like
    // local edits and the whole document would be re-uploaded on every open.
    const localReady = handle.ready.then(
      () =>
        new DocSync({
          transport,
          pageId,
          doc: handle.doc,
          onStatus: (s) => useSyncStore.getState().setDoc(pageId, s),
          onDirtyChange: (d) => void db.pages.update(pageId, { docDirty: d ? 1 : 0 }),
        }),
    )
    const ready = localReady.then(async (sync) => {
      await sync.start()
      return sync
    })
    e = { doc: handle.doc, refs: 0, release: handle.release, localReady, ready }
    live.set(pageId, e)
  }
  e.refs++
  const entry = e
  let released = false
  return {
    doc: entry.doc,
    localReady: entry.localReady,
    ready: entry.ready,
    release: async () => {
      if (released) return
      released = true
      entry.refs--
      if (entry.refs > 0) return
      live.delete(pageId)
      const sync = await entry.ready.catch(() => entry.localReady)
      await sync.destroy()
      useSyncStore.getState().setDoc(pageId, null)
      entry.release()
    },
  }
}

/** Uploads content for pages edited while their sync wasn't running (offline, or pre-M3). */
export async function uploadDirtyDocs(workspaceId: string, isStopped: () => boolean): Promise<void> {
  const dirty = await db.pages.where('[workspaceId+docDirty]').equals([workspaceId, 1]).toArray()
  for (const page of dirty) {
    if (isStopped()) return
    if (live.has(page.id)) continue // the editor's sync already handles it
    const h = acquireSync(page.id)
    const sync = await h.ready
    await sync.flush()
    if (sync.status === 'synced') await db.pages.update(page.id, { docDirty: 0 })
    await h.release()
  }
}
