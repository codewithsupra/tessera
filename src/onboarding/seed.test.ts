import 'fake-indexeddb/auto'
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { db } from '../data/db'
import { openDoc } from '../data/docs'
import { contentSchema } from '../editor/extensions'
import { seedPages } from './seedContent'
import { seedWorkspace, writeSeedDoc } from './seed'

describe('seed content', () => {
  it.each(seedPages.map((p) => [p.title, p] as const))('“%s” is valid for the editor schema', (_title, page) => {
    const doc = new Y.Doc()
    writeSeedDoc(doc, page.title, page.content)
    // Throws if any node or mark isn't allowed where it's placed.
    const node = yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment('content'), contentSchema())
    node.check()
    expect(node.childCount).toBe(page.content.content!.length)
    expect(doc.getText('title').toString()).toBe(page.title)
  })

  it('keeps structure (headings, to-dos with checked state, marks)', () => {
    const doc = new Y.Doc()
    const checklist = seedPages.find((p) => p.key === 'checklist')!
    writeSeedDoc(doc, checklist.title, checklist.content)
    const json = yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment('content'), contentSchema()).toJSON()
    const items = json.content[1].content
    expect(items[0].attrs.checked).toBe(true)
    expect(items[1].attrs.checked).toBe(false)
  })

  it('references only parents that come earlier', () => {
    const seen = new Set<string>()
    for (const p of seedPages) {
      if (p.parent) expect(seen.has(p.parent)).toBe(true)
      seen.add(p.key)
    }
  })
})

describe('seedWorkspace', () => {
  beforeEach(async () => {
    await db.pages.clear()
  })

  it('creates the sample pages with content, nesting and upload flags', async () => {
    const ids = await seedWorkspace('ws-seed')
    const rows = await db.pages.where('workspaceId').equals('ws-seed').toArray()
    expect(rows).toHaveLength(seedPages.length)
    const welcome = rows.find((r) => r.title === 'Welcome to Tessera')!
    const checklist = rows.find((r) => r.title === 'Getting started checklist')!
    expect(checklist.parentId).toBe(welcome.id)
    expect(rows.every((r) => r.dirty === 1 && r.docDirty === 1)).toBe(true)

    const h = openDoc(ids[0])
    await h.ready
    expect(h.doc.getXmlFragment('content').length).toBeGreaterThan(3)
    h.release()
  })
})
