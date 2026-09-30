import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { applyTextDiff, openDoc } from './docs'

describe('applyTextDiff', () => {
  const cases: [string, string][] = [
    ['', 'Plan'],
    ['Plan', ''],
    ['Launch plan', 'Launch beta plan'],
    ['Launch plan', 'Lunch plan'],
    ['abc', 'xyz'],
    ['aaa', 'aa'],
    ['same', 'same'],
  ]
  it.each(cases)('turns %j into %j', (from, to) => {
    const doc = new Y.Doc()
    const t = doc.getText('title')
    t.insert(0, from)
    applyTextDiff(t, to)
    expect(t.toString()).toBe(to)
  })

  it('lets concurrent edits to different parts of a title both survive', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    a.getText('t').insert(0, 'Launch plan')
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    applyTextDiff(a.getText('t'), 'Q4 Launch plan')
    applyTextDiff(b.getText('t'), 'Launch plan v2')
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    expect(a.getText('t').toString()).toBe('Q4 Launch plan v2')
    expect(b.getText('t').toString()).toBe('Q4 Launch plan v2')
  })
})

describe('openDoc', () => {
  it('persists content to IndexedDB and loads it back after the doc is closed', async () => {
    const first = openDoc('page-1')
    await first.ready
    first.doc.getText('title').insert(0, 'Offline notes')
    await new Promise((r) => setTimeout(r, 50))
    first.release()
    await new Promise((r) => setTimeout(r, 50))

    const second = openDoc('page-1')
    await second.ready
    expect(second.doc.getText('title').toString()).toBe('Offline notes')
    second.release()
  })

  it('shares one doc between handles and keeps it open until the last release', async () => {
    const h1 = openDoc('page-2')
    const h2 = openDoc('page-2')
    expect(h1.doc).toBe(h2.doc)
    h1.release()
    h1.release() // double release is a no-op
    expect(openDoc('page-2').doc).toBe(h2.doc)
  })
})

describe('per-user scope', () => {
  it('keeps each account’s documents in separate databases', async () => {
    const { scopeDocs, docName } = await import('./docs')
    scopeDocs('alice')
    const a = openDoc('shared-page')
    await a.ready
    a.doc.getText('title').insert(0, 'Alice private draft')
    await new Promise((r) => setTimeout(r, 50))
    a.release()
    await new Promise((r) => setTimeout(r, 50))

    scopeDocs('bob')
    expect(docName('shared-page')).toBe('tessera-doc-bob-shared-page')
    const b = openDoc('shared-page')
    await b.ready
    expect(b.doc.getText('title').toString()).toBe('')
    b.release()
    scopeDocs(null)
  })
})
