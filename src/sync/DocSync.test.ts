import * as Y from 'yjs'
import { DocSync, changesDoc, updateHasContent, type SyncStatus } from './DocSync'
import { fromB64, toB64 } from './base64'
import { FakeServer, type FakeClient } from './fakeTransport'

const PAGE = 'page-1'
const settle = async (ms = 30) => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, ms / 5))
}

type Peer = { doc: Y.Doc; sync: DocSync; client: FakeClient; statuses: SyncStatus[]; dirty: boolean[] }

async function peer(server: FakeServer, name: string, opts: { compactThreshold?: number } = {}): Promise<Peer> {
  const doc = new Y.Doc()
  const client = server.client(name)
  const statuses: SyncStatus[] = []
  const dirty: boolean[] = []
  const sync = new DocSync({
    transport: client,
    pageId: PAGE,
    doc,
    flushDelayMs: 0,
    onStatus: (s) => statuses.push(s),
    onDirtyChange: (d) => dirty.push(d),
    ...opts,
  })
  await sync.start()
  return { doc, sync, client, statuses, dirty }
}

const text = (p: Peer) => p.doc.getText('t').toString()
const type = (p: Peer, at: number, s: string) => p.doc.getText('t').insert(at, s)

let server: FakeServer
beforeEach(() => {
  server = new FakeServer()
  server.pages.add(PAGE)
})

describe('base64', () => {
  it('round-trips arbitrary and large byte arrays', () => {
    const big = new Uint8Array(300_000).map((_, i) => (i * 31) % 256)
    expect(fromB64(toB64(big))).toEqual(big)
    expect(fromB64(toB64(new Uint8Array()))).toEqual(new Uint8Array())
  })
})

describe('updateHasContent', () => {
  it('distinguishes empty diffs from real edits', () => {
    const doc = new Y.Doc()
    expect(updateHasContent(Y.encodeStateAsUpdate(doc))).toBe(false)
    doc.getText('t').insert(0, 'x')
    expect(updateHasContent(Y.encodeStateAsUpdate(doc))).toBe(true)
    const sv = Y.encodeStateVector(doc)
    expect(updateHasContent(Y.encodeStateAsUpdate(doc, sv))).toBe(false)
    doc.getText('t').delete(0, 1)
    expect(updateHasContent(Y.encodeStateAsUpdate(doc, sv))).toBe(true)
  })
})

describe('changesDoc', () => {
  it('ignores a delete set the target already has', () => {
    const a = new Y.Doc()
    a.getText('t').insert(0, 'hello world')
    a.getText('t').delete(0, 6)
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const diff = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b))
    expect(updateHasContent(diff)).toBe(true) // the naive check would push this
    expect(changesDoc(b, diff)).toBe(false)
    a.getText('t').delete(0, 1)
    expect(changesDoc(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))).toBe(true)
  })
})

describe('DocSync', () => {
  it('relays edits between two peers and converges on concurrent typing', async () => {
    const a = await peer(server, 'a')
    const b = await peer(server, 'b')
    type(a, 0, 'hello')
    await settle()
    expect(text(b)).toBe('hello')

    type(a, 5, ' from A')
    type(b, 0, 'B: ')
    await settle()
    expect(text(a)).toBe(text(b))
    expect(text(a)).toContain('from A')
    expect(text(a)).toContain('B: ')
    expect(a.statuses.at(-1)).toBe('synced')
  })

  it('does not echo remote updates back to the server', async () => {
    const a = await peer(server, 'a')
    await peer(server, 'b')
    type(a, 0, 'one')
    await settle()
    expect(server.appendCount).toBe(1)
  })

  it('does not re-send the delete set on every resync', async () => {
    const a = await peer(server, 'a')
    type(a, 0, 'hello world')
    await settle()
    a.doc.getText('t').delete(0, 6)
    await settle()
    const appends = server.appendCount
    await a.sync.resync()
    await a.sync.resync()
    const b = await peer(server, 'b')
    await b.sync.resync()
    expect(server.appendCount).toBe(appends)
    expect(text(b)).toBe('world')
  })

  it('loads existing content for a late joiner', async () => {
    const a = await peer(server, 'a')
    type(a, 0, 'written earlier')
    await settle()
    const late = await peer(server, 'late')
    expect(text(late)).toBe('written earlier')
  })

  it('merges edits made offline on both sides after reconnecting', async () => {
    const a = await peer(server, 'a')
    const b = await peer(server, 'b')
    type(a, 0, 'shared ')
    await settle()

    a.client.online = false
    b.client.online = false
    type(a, text(a).length, '[a offline]')
    type(b, 0, '[b offline] ')
    await settle()
    expect(a.statuses.at(-1)).toBe('offline')
    expect(a.dirty.at(-1)).toBe(true)

    a.client.online = true
    b.client.online = true
    await a.sync.resync()
    await b.sync.resync()
    await a.sync.resync() // pick up b's push
    await settle()
    expect(text(a)).toBe(text(b))
    expect(text(a)).toContain('[a offline]')
    expect(text(a)).toContain('[b offline]')
    expect(a.dirty.at(-1)).toBe(false)
    expect(a.statuses.at(-1)).toBe('synced')
  })

  it('stays dirty after an offline failure until a resync confirms the server has everything', async () => {
    const a = await peer(server, 'a')
    a.client.online = false
    type(a, 0, 'offline words')
    await settle()
    expect(a.dirty.at(-1)).toBe(true)
    await a.sync.flush() // empty queue: must not claim success
    expect(a.dirty.at(-1)).toBe(true)
    await a.sync.destroy() // closing the page offline must not clear the flag either
    expect(a.dirty.at(-1)).toBe(true)
  })

  it('recovers from a dropped broadcast by resyncing from storage', async () => {
    const a = await peer(server, 'a')
    const b = await peer(server, 'b')
    server.dropFor.set('b', 1)
    type(a, 0, 'lost ')
    await settle()
    expect(text(b)).toBe('') // b never heard about it
    type(a, text(a).length, 'found') // depends on the lost update -> gap on b
    await settle(60)
    expect(text(b)).toBe('lost found')
  })

  it('fetches updates that are announced by id only', async () => {
    const a = await peer(server, 'a')
    const b = await peer(server, 'b')
    server.announceByIdOnly = true
    type(a, 0, 'large payload stand-in')
    await settle()
    expect(text(b)).toBe('large payload stand-in')
  })

  it('retries when the page row has not reached the server yet', async () => {
    server.pages.delete(PAGE)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const a = await peer(server, 'a')
      type(a, 0, 'created offline')
      await vi.advanceTimersByTimeAsync(50)
      expect(server.appendCount).toBe(0)
      server.pages.add(PAGE) // page metadata sync catches up
      await vi.advanceTimersByTimeAsync(2000)
      const fresh = await peer(server, 'fresh')
      expect(text(fresh)).toBe('created offline')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps content intact across compaction and asks for it past the threshold', async () => {
    const a = await peer(server, 'a', { compactThreshold: 3 })
    for (const w of ['one ', 'two ', 'three ', 'four']) {
      type(a, text(a).length, w)
      await settle(10)
    }
    await a.sync.resync()
    expect(a.client.compactionRequests).toBeGreaterThan(0)
    server.compact(PAGE)
    expect(server.updates.get(PAGE)).toHaveLength(0)
    const late = await peer(server, 'late')
    expect(text(late)).toBe('one two three four')
  })

  it('shares cursor presence and clears it when a peer leaves', async () => {
    const a = await peer(server, 'a')
    const b = await peer(server, 'b')
    a.sync.awareness.setLocalStateField('user', { name: 'Ada' })
    await settle()
    const seen = () => [...b.sync.awareness.getStates().values()].map((s) => (s.user as { name?: string } | undefined)?.name)
    expect(seen()).toContain('Ada')
    await a.sync.destroy()
    await settle()
    expect(seen()).not.toContain('Ada')
  })

  it('subscribes later if it started offline, then receives live edits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const doc = new Y.Doc()
      const client = server.client('b')
      client.online = false
      const sync = new DocSync({ transport: client, pageId: PAGE, doc, flushDelayMs: 0 })
      await sync.start()
      expect(sync.status).toBe('offline')
      client.online = true
      await vi.advanceTimersByTimeAsync(5100)
      expect(sync.status).toBe('synced')
      const a = await peer(server, 'a')
      type(a, 0, 'live after reconnect')
      await vi.advanceTimersByTimeAsync(50)
      expect(doc.getText('t').toString()).toBe('live after reconnect')
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops cursors when their tab is closed (pagehide) or their user leaves the channel', async () => {
    const a = await peer(server, 'a')
    const b = await peer(server, 'b')
    const c = await peer(server, 'c')
    a.sync.awareness.setLocalStateField('user', { name: 'Ada', id: 'u-ada' })
    c.sync.awareness.setLocalStateField('user', { name: 'Cy', id: 'u-cy' })
    await settle()
    const names = () => [...b.sync.awareness.getStates().values()].map((s) => (s.user as { name?: string } | undefined)?.name)
    expect(names()).toEqual(expect.arrayContaining(['Ada', 'Cy']))

    window.dispatchEvent(new Event('pagehide')) // every peer in this test shares one window
    await settle()
    expect(names()).not.toContain('Ada')

    window.dispatchEvent(new Event('pageshow')) // restored from the back/forward cache
    await settle()
    expect(names()).toEqual(expect.arrayContaining(['Ada', 'Cy']))
    b.sync.dropPeer('u-cy') // presence:leave for Cy
    expect(names()).not.toContain('Cy')
  })

  it('never sends anything in read-only mode, but still receives', async () => {
    const editor = await peer(server, 'editor')
    const doc = new Y.Doc()
    doc.getText('t').insert(0, 'stray local state ') // e.g. an editor plugin normalizing the doc
    const sync = new DocSync({ transport: server.client('viewer'), pageId: PAGE, doc, flushDelayMs: 0 })
    sync.readOnly = true
    await sync.start()
    doc.getText('t').insert(0, 'typed anyway')
    type(editor, 0, 'from the editor ')
    await settle()
    expect(server.appendCount).toBe(1) // only the editor's edit
    expect(doc.getText('t').toString()).toContain('from the editor')
    expect(sync.status).toBe('synced')
    await sync.destroy()
  })

  it('flushes pending edits when destroyed', async () => {
    const doc = new Y.Doc()
    const client = server.client('a')
    const sync = new DocSync({ transport: client, pageId: PAGE, doc, flushDelayMs: 10_000 })
    await sync.start()
    doc.getText('t').insert(0, 'closing the tab')
    await sync.destroy()
    const late = await peer(server, 'late')
    expect(text(late)).toBe('closing the tab')
  })
})
