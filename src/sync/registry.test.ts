import 'fake-indexeddb/auto'
import { db } from '../data/db'
import { FakeServer } from './fakeTransport'

vi.mock('../lib/insforge', () => ({ insforge: {} }))
const { acquireSync, setTransport, uploadDirtyDocs } = await import('./registry')

const settle = () => new Promise((r) => setTimeout(r, 250))

let server: FakeServer
beforeEach(async () => {
  server = new FakeServer()
  setTransport(server.client('me'))
  await db.pages.clear()
})

describe('sync registry', () => {
  it('does not re-upload a document just because it was reopened', async () => {
    server.pages.add('p1')
    const first = acquireSync('p1')
    await first.ready
    first.doc.getText('t').insert(0, 'hello')
    await settle()
    await first.release()
    const appendsAfterEdit = server.appendCount
    expect(appendsAfterEdit).toBe(1)

    const second = acquireSync('p1')
    await second.ready
    expect(second.doc.getText('t').toString()).toBe('hello')
    await settle()
    await second.release()
    expect(server.appendCount).toBe(appendsAfterEdit)
  })

  it('shares one sync between concurrent users of a page', async () => {
    server.pages.add('p2')
    const a = acquireSync('p2')
    const b = acquireSync('p2')
    expect(await a.localReady).toBe(await b.localReady)
    await a.release()
    b.doc.getText('t').insert(0, 'still live')
    await settle()
    expect(server.appendCount).toBe(1)
    await b.release()
  })

  it('clears a stale upload flag once the server is confirmed to have the page, even while it is open', async () => {
    server.pages.add('p4')
    await db.pages.put({ id: 'p4', workspaceId: 'w', parentId: null, title: '', icon: null, kind: 'page', order: 0, createdAt: 1, updatedAt: 1, deletedAt: null, dirty: 0, docDirty: 1 })
    const editorHandle = acquireSync('p4') // e.g. the page is open in the editor
    await editorHandle.ready
    await settle()
    expect((await db.pages.get('p4'))?.docDirty).toBe(0) // resync confirmed nothing to push
    await db.pages.update('p4', { docDirty: 1 }) // flag set again by something else
    expect(await uploadDirtyDocs('w', () => false)).toEqual([])
    expect((await db.pages.get('p4'))?.docDirty).toBe(0)
    await editorHandle.release()
  })

  it('uploads content for pages edited while offline, then clears the flag', async () => {
    server.pages.add('p3')
    const client = server.client('me')
    client.online = false
    setTransport(client)
    await db.pages.put({ id: 'p3', workspaceId: 'w', parentId: null, title: '', icon: null, kind: 'page', order: 0, createdAt: 1, updatedAt: 1, deletedAt: null, dirty: 0, docDirty: 0 })
    const h = acquireSync('p3')
    await h.ready
    h.doc.getText('t').insert(0, 'written on the train')
    await settle()
    expect((await db.pages.get('p3'))?.docDirty).toBe(1)
    await h.release()

    client.online = true
    await uploadDirtyDocs('w', () => false)
    expect((await db.pages.get('p3'))?.docDirty).toBe(0)
    const reader = server.client('reader')
    const { updates } = await reader.load('p3')
    expect(updates.length).toBeGreaterThan(0)
  })
})
