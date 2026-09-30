import { db } from '../data/db'
import type { PageRow } from '../data/tree'

/** A page row as stored on the server (snake_case, ISO timestamps). */
export type RemotePage = {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  icon: string | null
  kind: 'page' | 'database'
  sort_order: number
  properties?: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
  server_updated_at: string
}

export type RemotePageInput = Omit<RemotePage, 'server_updated_at'>

export interface PagesApi {
  /** Rows changed at or after `since` (server clock), oldest first. */
  pull(workspaceId: string, since: string | null): Promise<RemotePage[]>
  push(rows: RemotePageInput[]): Promise<void>
  /** Live row changes for the workspace. `onReconnect` fires after the connection comes back. */
  subscribe(workspaceId: string, onPage: (row: RemotePage) => void, onReconnect: () => void): Promise<() => void>
}

const iso = (ms: number) => new Date(ms).toISOString()

export function toRemote(p: PageRow): RemotePageInput {
  return {
    id: p.id,
    workspace_id: p.workspaceId,
    parent_id: p.parentId,
    title: p.title,
    icon: p.icon,
    kind: p.kind,
    sort_order: p.order,
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt),
    deleted_at: p.deletedAt === null ? null : iso(p.deletedAt),
  }
}

export function fromRemote(r: RemotePage, docDirty: 0 | 1 = 0): PageRow {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    parentId: r.parent_id,
    title: r.title,
    icon: r.icon,
    kind: r.kind,
    order: r.sort_order,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
    deletedAt: r.deleted_at ? Date.parse(r.deleted_at) : null,
    dirty: 0,
    docDirty,
  }
}

/**
 * Last-write-wins on the edit timestamp. Returns the row to store, or null to keep local
 * (a local edit that is newer than the remote one and will be pushed).
 */
export function mergeRemote(local: PageRow | undefined, remote: RemotePage): PageRow | null {
  if (!local) return fromRemote(remote)
  const remoteAt = Date.parse(remote.updated_at)
  if (local.dirty && local.updatedAt > remoteAt) return null
  if (remoteAt < local.updatedAt) return null
  return fromRemote(remote, local.docDirty ?? 0)
}

export function sameContent(a: PageRow, b: PageRow): boolean {
  return JSON.stringify(toRemote(a)) === JSON.stringify(toRemote(b))
}

/** Pull overlap: rows committed slightly out of order on the server are still picked up. */
const PULL_OVERLAP_MS = 5000

export type EngineStatus = 'idle' | 'syncing' | 'synced' | 'offline'

/** Keeps the local page index of one workspace in sync with the server. */
export class PagesSyncEngine {
  private readonly ws: string
  private readonly api: PagesApi
  private readonly onStatus: (s: EngineStatus) => void
  private unsubscribe: (() => void) | null = null
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<void> | null = null
  private again = false
  private stopped = false

  constructor(workspaceId: string, api: PagesApi, onStatus: (s: EngineStatus) => void = () => {}) {
    this.ws = workspaceId
    this.api = api
    this.onStatus = onStatus
  }

  async start(): Promise<void> {
    await this.sync()
  }

  /** Debounced push after a local change. */
  schedulePush(delayMs = 400) {
    if (this.stopped) return
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => void this.sync(), delayMs)
  }

  /** Subscribe (once), pull, push. Coalesces overlapping calls. */
  sync(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.again = false
        await this.runOnce()
      } while (this.again && !this.stopped)
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async runOnce() {
    this.onStatus('syncing')
    try {
      if (!this.unsubscribe) {
        this.unsubscribe = await this.api.subscribe(
          this.ws,
          (row) => void this.applyRemote([row]),
          () => void this.sync(),
        )
      }
      await this.pull()
      await this.push()
      this.onStatus('synced')
    } catch {
      this.onStatus('offline')
      if (this.retryTimer) clearTimeout(this.retryTimer)
      if (!this.stopped) this.retryTimer = setTimeout(() => void this.sync(), 5000)
    }
  }

  async applyRemote(rows: RemotePage[]): Promise<void> {
    const mine = rows.filter((r) => r.workspace_id === this.ws)
    if (!mine.length) return
    await db.transaction('rw', db.pages, async () => {
      for (const r of mine) {
        const next = mergeRemote(await db.pages.get(r.id), r)
        if (next) await db.pages.put(next)
      }
    })
  }

  private cursorKey() {
    return `pages-cursor:${this.ws}`
  }

  private async pull() {
    const cursor = (await db.meta.get(this.cursorKey()))?.value ?? null
    const since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null
    const rows = await this.api.pull(this.ws, since)
    await this.applyRemote(rows)
    const newest = rows.reduce<string | null>((m, r) => (!m || r.server_updated_at > m ? r.server_updated_at : m), cursor)
    if (newest && newest !== cursor) await db.meta.put({ key: this.cursorKey(), value: newest })
  }

  private async push() {
    const dirty = await db.pages.where('[workspaceId+dirty]').equals([this.ws, 1]).toArray()
    if (!dirty.length) return
    await this.api.push(dirty.map(toRemote))
    // Clear the flag only where the row still matches what we sent (content, not timestamps:
    // two edits can share a millisecond).
    await db.transaction('rw', db.pages, async () => {
      for (const sent of dirty) {
        const now = await db.pages.get(sent.id)
        if (now?.dirty && sameContent(now, sent)) await db.pages.update(sent.id, { dirty: 0 })
      }
    })
  }

  stop() {
    this.stopped = true
    if (this.pushTimer) clearTimeout(this.pushTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.unsubscribe?.()
  }
}

/** Moves pages created before sign-in to the cloud workspace (M2 → M3) and marks them for upload. */
export async function adoptLocalPages(fromWorkspaceId: string, toWorkspaceId: string): Promise<number> {
  return db.transaction('rw', db.pages, async () => {
    const rows = await db.pages.where('workspaceId').equals(fromWorkspaceId).toArray()
    for (const r of rows) await db.pages.update(r.id, { workspaceId: toWorkspaceId, dirty: 1, docDirty: 1 })
    return rows.length
  })
}
