import * as awarenessProtocol from 'y-protocols/awareness'
import * as Y from 'yjs'
import { fromB64, toB64 } from './base64'
import { TransportError, type DocTransport } from './transport'

export type SyncStatus = 'connecting' | 'synced' | 'saving' | 'offline' | 'error'

type Options = {
  transport: DocTransport
  pageId: string
  doc: Y.Doc
  /** Called when local edits exist that the server hasn't confirmed (and when that clears). */
  onDirtyChange?: (dirty: boolean) => void
  onStatus?: (status: SyncStatus) => void
  flushDelayMs?: number
  compactThreshold?: number
}

/** True if a Yjs update carries any insertions or deletions. */
export function updateHasContent(update: Uint8Array): boolean {
  const { structs, ds } = Y.decodeUpdate(update)
  return structs.length > 0 || ds.clients.size > 0
}

/** True if applying `update` would change `doc` (Yjs emits 'update' only for real changes). */
export function changesDoc(doc: Y.Doc, update: Uint8Array): boolean {
  let changed = false
  const mark = () => {
    changed = true
  }
  doc.on('update', mark)
  Y.applyUpdate(doc, update)
  doc.off('update', mark)
  return changed
}

/**
 * Keeps one page's Y.Doc in sync with the backend.
 *
 * - Local edits are batched and appended durably; the backend broadcasts them.
 * - Remote updates arrive over realtime and are applied; applying twice is harmless.
 * - (Re)connecting reloads snapshot + updates, then pushes whatever the server is missing
 *   (computed from state vectors), so offline edits need no separate queue — the local
 *   IndexedDB copy of the doc *is* the queue.
 * - If an update is missed (Yjs reports pending structs), we resync from storage.
 */
export class DocSync {
  readonly awareness: awarenessProtocol.Awareness
  private readonly t: DocTransport
  private readonly pageId: string
  private readonly doc: Y.Doc
  private readonly opts: Options
  private queue: Uint8Array[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushing: Promise<boolean> | null = null
  private unsubscribe: (() => void) | null = null
  private destroyed = false
  private resyncing: Promise<void> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private dirty = false
  /**
   * A failed append dropped edits from the queue (they're still in the doc). Until a resync
   * diffs against the server, an empty queue does NOT mean the server has everything.
   */
  private unconfirmed = false
  /** Viewers only listen: nothing local is ever sent (the server would refuse it anyway). */
  readOnly = false

  setReadOnly(readOnly: boolean) {
    this.readOnly = readOnly
  }
  status: SyncStatus = 'connecting'

  constructor(opts: Options) {
    this.opts = opts
    this.t = opts.transport
    this.pageId = opts.pageId
    this.doc = opts.doc
    this.awareness = new awarenessProtocol.Awareness(this.doc)
    this.doc.on('update', this.onLocalUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    // Closing a tab doesn't unmount anything; announce departure so peers drop our cursor now.
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide)
      window.addEventListener('pageshow', this.onPageShow)
    }
  }

  private hiddenState: Record<string, unknown> | null = null

  private onPageHide = () => {
    this.hiddenState = this.awareness.getLocalState()
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'pagehide')
  }

  /** Back/forward cache restore: come back with the same cursor identity. */
  private onPageShow = () => {
    if (this.hiddenState && this.awareness.getLocalState() === null) this.awareness.setLocalState(this.hiddenState)
    this.hiddenState = null
  }

  /** Removes cursors belonging to a user whose last connection left the channel. */
  dropPeer(userId: string) {
    const gone = [...this.awareness.getStates()]
      .filter(([clientId, state]) => clientId !== this.doc.clientID && (state.user as { id?: string } | undefined)?.id === userId)
      .map(([clientId]) => clientId)
    if (gone.length) awarenessProtocol.removeAwarenessStates(this.awareness, gone, this)
  }

  /** Subscribe, load and reconcile. Failures retry on their own. */
  start(): Promise<void> {
    return this.resync()
  }

  /** Reload from storage and push anything the server lacks. Safe to call any time. */
  resync(): Promise<void> {
    if (this.destroyed) return Promise.resolve()
    if (!this.resyncing) {
      this.resyncing = this.doResync().finally(() => {
        this.resyncing = null
      })
    }
    return this.resyncing
  }

  private async doResync(): Promise<void> {
    this.setStatus(this.status === 'offline' ? 'offline' : 'connecting')
    try {
      // Subscribe before loading so nothing published in between is missed.
      if (!this.unsubscribe) {
        this.unsubscribe = await this.t.subscribe(this.pageId, {
          onUpdate: (u) => void this.onRemote(u),
          onAwareness: (data) => awarenessProtocol.applyAwarenessUpdate(this.awareness, fromB64(data), this),
          onReconnect: () => void this.resync(),
          onPeerLeft: (userId) => this.dropPeer(userId),
        })
        if (this.destroyed) {
          this.unsubscribe()
          return
        }
      }
      const state = await this.t.load(this.pageId)
      const server = new Y.Doc()
      const apply = (data: string) => {
        const bytes = fromB64(data)
        Y.applyUpdate(server, bytes)
        Y.applyUpdate(this.doc, bytes, this)
      }
      if (state.snapshot) apply(state.snapshot.data)
      state.updates.forEach((u) => apply(u.data))

      const missing = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(server))
      // State vectors don't track deletions, so every diff carries the whole delete set.
      // Push only if applying it would actually change the server's state.
      const serverLacksSomething = changesDoc(server, missing)
      server.destroy()
      // `missing` is computed against the server's actual state, so it covers anything dropped earlier.
      this.unconfirmed = false
      // Peers may have dropped our cursor while we were away; re-announce it now rather than
      // waiting for the 15s awareness heartbeat.
      const me = this.awareness.getLocalState()
      if (me) this.awareness.setLocalState(me)
      if (state.updates.length >= (this.opts.compactThreshold ?? 200)) this.t.requestCompaction(this.pageId)
      if (serverLacksSomething && !this.readOnly) {
        this.queue.push(missing)
        await this.flush() // sets synced/offline itself
      } else if (this.queue.length === 0) {
        // The server provably has everything: report clean even if we never saw it dirty,
        // so flags set elsewhere (e.g. freshly seeded pages) are cleared.
        this.dirty = false
        this.opts.onDirtyChange?.(false)
        this.setStatus('synced')
      }
    } catch (e) {
      this.fail(e)
    }
  }

  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.destroyed || this.readOnly) return
    this.queue.push(update)
    this.setDirty(true)
    this.setStatus('saving')
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => void this.flush(), this.opts.flushDelayMs ?? 150)
  }

  /** Sends queued local updates as one merged update. Resolves true if everything was stored. */
  flush(): Promise<boolean> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (!this.flushing) {
      this.flushing = (async () => {
        while (this.queue.length && !this.destroyed) {
          const batch = this.queue
          this.queue = []
          const merged = Y.mergeUpdates(batch)
          try {
            await this.t.append(this.pageId, toB64(merged))
          } catch (e) {
            // Nothing is lost: the doc (persisted locally) still has these edits, and the
            // next resync pushes the state-vector diff. Drop the batch and back off.
            this.queue = []
            this.unconfirmed = true
            this.fail(e)
            return false
          }
        }
        if (this.unconfirmed) return false
        if (!this.destroyed) {
          this.setDirty(false)
          this.setStatus('synced')
        }
        return true
      })().finally(() => {
        this.flushing = null
      })
    }
    return this.flushing
  }

  private async onRemote(u: { id: number; data?: string }) {
    if (this.destroyed) return
    let data = u.data
    if (!data) {
      try {
        data = (await this.t.fetchUpdate(this.pageId, u.id))?.data
      } catch (e) {
        this.fail(e)
        return
      }
      if (!data) return
    }
    Y.applyUpdate(this.doc, fromB64(data), this)
    // A gap means we missed an earlier update; storage has everything, so reload.
    if (this.doc.store.pendingStructs || this.doc.store.pendingDs) void this.resync()
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this || this.destroyed) return
    const changed = added.concat(updated, removed)
    const data = toB64(awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed))
    this.t.publishAwareness(this.pageId, data).catch(() => {
      // Presence is best-effort; the 30s awareness heartbeat re-sends it.
    })
  }

  private fail(e: unknown) {
    const kind = e instanceof TransportError ? e.kind : 'unknown'
    this.setStatus(kind === 'forbidden' ? 'error' : 'offline')
    if (kind === 'forbidden' || this.destroyed) return
    // Retry soon; 'missing-page' resolves once the page metadata has been pushed.
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => void this.resync(), kind === 'missing-page' ? 1500 : 5000)
  }

  private setStatus(s: SyncStatus) {
    if (this.status === s) return
    this.status = s
    this.opts.onStatus?.(s)
  }

  private setDirty(d: boolean) {
    if (this.dirty === d) return
    this.dirty = d
    this.opts.onDirtyChange?.(d)
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return
    await this.flush().catch(() => {})
    // Announce departure while still live, so peers drop our cursor now rather than after the 30s timeout.
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy')
    this.destroyed = true
    if (this.flushTimer) clearTimeout(this.flushTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide)
      window.removeEventListener('pageshow', this.onPageShow)
    }
    this.doc.off('update', this.onLocalUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    this.awareness.destroy()
    this.unsubscribe?.()
  }
}
