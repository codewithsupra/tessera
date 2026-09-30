import 'fake-indexeddb/auto'
import { db } from '../data/db'
import { createPage, setPageTitle, trashPage } from '../data/pages'
import type { PageRow } from '../data/tree'
import { PagesSyncEngine, adoptLocalPages, fromRemote, mergeRemote, toRemote, type PagesApi, type RemotePage, type RemotePageInput } from './pagesSync'

const WS = 'ws-1'
const iso = (ms: number) => new Date(ms).toISOString()

function remote(id: string, updatedAt: number, extra: Partial<RemotePage> = {}): RemotePage {
  return {
    id,
    workspace_id: WS,
    parent_id: null,
    title: `remote ${id}`,
    icon: null,
    kind: 'page',
    sort_order: 0,
    created_at: iso(1000),
    updated_at: iso(updatedAt),
    deleted_at: null,
    server_updated_at: iso(updatedAt + 1),
    ...extra,
  }
}

/** A tiny server with the same LWW rule as the Postgres trigger. */
class FakePagesServer implements PagesApi {
  rows = new Map<string, RemotePage>()
  online = true
  listeners: ((r: RemotePage) => void)[] = []
  clock = 10_000
  pushes = 0
  private guard() {
    if (!this.online) throw new Error('offline')
  }
  async pull(ws: string, since: string | null) {
    this.guard()
    return [...this.rows.values()].filter((r) => r.workspace_id === ws && (!since || r.server_updated_at >= since)).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
  }
  async push(input: RemotePageInput[]) {
    this.guard()
    this.pushes++
    for (const r of input) {
      const old = this.rows.get(r.id)
      if (old && r.updated_at < old.updated_at) continue
      const row = { ...r, server_updated_at: iso(++this.clock) }
      this.rows.set(r.id, row)
      this.listeners.forEach((l) => l(row))
    }
  }
  async subscribe(_ws: string, onPage: (r: RemotePage) => void) {
    this.guard()
    this.listeners.push(onPage)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== onPage)
    }
  }
}

beforeEach(async () => {
  await db.pages.clear()
  await db.meta.clear()
})

describe('row mapping', () => {
  it('round-trips a page through the remote shape', () => {
    const local: PageRow = { id: 'p', workspaceId: WS, parentId: 'q', title: 'T', icon: null, kind: 'page', order: 3, createdAt: 1000, updatedAt: 2000, deletedAt: 3000, dirty: 0, docDirty: 0 }
    expect(fromRemote({ ...toRemote(local), server_updated_at: iso(5) })).toEqual(local)
  })
})

describe('mergeRemote', () => {
  const local = (updatedAt: number, dirty: 0 | 1): PageRow => ({ ...fromRemote(remote('p', updatedAt)), title: 'local', dirty, docDirty: 1 })
  it('takes remote rows that are new or newer', () => {
    expect(mergeRemote(undefined, remote('p', 5))?.title).toBe('remote p')
    expect(mergeRemote(local(5, 0), remote('p', 9))?.title).toBe('remote p')
  })
  it('keeps a newer local edit', () => {
    expect(mergeRemote(local(9, 1), remote('p', 5))).toBeNull()
    expect(mergeRemote(local(9, 0), remote('p', 5))).toBeNull()
  })
  it('preserves the local content-dirty flag when taking remote metadata', () => {
    expect(mergeRemote(local(5, 0), remote('p', 9))?.docDirty).toBe(1)
  })
})

describe('PagesSyncEngine', () => {
  it('pushes local changes and clears the dirty flag', async () => {
    const server = new FakePagesServer()
    const engine = new PagesSyncEngine(WS, server)
    const p = await createPage(WS)
    await setPageTitle(p.id, 'Launch plan')
    await engine.sync()
    expect(server.rows.get(p.id)?.title).toBe('Launch plan')
    expect((await db.pages.get(p.id))?.dirty).toBe(0)
    engine.stop()
  })

  it('pulls pages created on another device', async () => {
    const server = new FakePagesServer()
    server.rows.set('r1', remote('r1', 5000))
    const engine = new PagesSyncEngine(WS, server)
    await engine.sync()
    expect((await db.pages.get('r1'))?.title).toBe('remote r1')
    engine.stop()
  })

  it('applies live changes from other devices', async () => {
    const server = new FakePagesServer()
    const engine = new PagesSyncEngine(WS, server)
    await engine.sync()
    await server.push([toRemote({ ...fromRemote(remote('live', 7000)), title: 'from phone' })])
    await new Promise((r) => setTimeout(r, 20))
    expect((await db.pages.get('live'))?.title).toBe('from phone')
    engine.stop()
  })

  it('queues changes while offline and pushes them later', async () => {
    const server = new FakePagesServer()
    const statuses: string[] = []
    const engine = new PagesSyncEngine(WS, server, (s) => statuses.push(s))
    await engine.sync()
    server.online = false
    const p = await createPage(WS)
    await trashPage(p.id)
    await engine.sync()
    expect(statuses.at(-1)).toBe('offline')
    expect((await db.pages.get(p.id))?.dirty).toBe(1)
    server.online = true
    await engine.sync()
    expect(server.rows.get(p.id)?.deleted_at).not.toBeNull()
    expect(statuses.at(-1)).toBe('synced')
    engine.stop()
  })

  it('keeps the dirty flag if the row changed during the push', async () => {
    const server = new FakePagesServer()
    const engine = new PagesSyncEngine(WS, server)
    const p = await createPage(WS)
    const realPush = server.push.bind(server)
    server.push = async (rows) => {
      await setPageTitle(p.id, 'edited mid-flight')
      await realPush(rows)
    }
    await engine.sync()
    expect((await db.pages.get(p.id))?.dirty).toBe(1)
    server.push = realPush
    await engine.sync()
    expect(server.rows.get(p.id)?.title).toBe('edited mid-flight')
    engine.stop()
  })

  it('ignores rows from other workspaces', async () => {
    const server = new FakePagesServer()
    const engine = new PagesSyncEngine(WS, server)
    await engine.applyRemote([remote('x', 5, { workspace_id: 'other' })])
    expect(await db.pages.get('x')).toBeUndefined()
    engine.stop()
  })
})

describe('adoptLocalPages', () => {
  it('moves pre-sync local pages into the cloud workspace and marks them for upload', async () => {
    await createPage('local:u1')
    await createPage('local:u1')
    await createPage('local:u2')
    expect(await adoptLocalPages('local:u1', WS)).toBe(2)
    const mine = await db.pages.where('workspaceId').equals(WS).toArray()
    expect(mine).toHaveLength(2)
    expect(mine.every((r) => r.dirty === 1 && r.docDirty === 1)).toBe(true)
  })
})
