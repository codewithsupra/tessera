import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import type * as Y from 'yjs'
import { db } from '../data/db'
import { openDoc } from '../data/docs'
import { createPage, setPageTitle } from '../data/pages'
import { contentSchema } from '../editor/extensions'
import { seedPages, type JSONNode } from './seedContent'

/** Writes a page's title and ProseMirror JSON into its Y.Doc, using the editor's real schema. */
export function writeSeedDoc(doc: Y.Doc, title: string, content: JSONNode) {
  doc.transact(() => {
    const ytitle = doc.getText('title')
    if (ytitle.length) ytitle.delete(0, ytitle.length)
    ytitle.insert(0, title)
    prosemirrorJSONToYXmlFragment(contentSchema(), content, doc.getXmlFragment('content'))
  })
}

/**
 * Adds the sample pages to a workspace as ordinary local pages (metadata + Yjs content,
 * marked for upload), so they sync exactly like anything the user writes.
 */
export async function seedWorkspace(workspaceId: string): Promise<string[]> {
  const ids = new Map<string, string>()
  for (const page of seedPages) {
    const row = await createPage(workspaceId, page.parent ? (ids.get(page.parent) ?? null) : null)
    ids.set(page.key, row.id)
    const handle = openDoc(row.id)
    await handle.ready
    writeSeedDoc(handle.doc, page.title, page.content)
    await setPageTitle(row.id, page.title)
    await db.pages.update(row.id, { docDirty: 1 })
    // Let IndexedDB persist the update before closing the doc.
    await new Promise((r) => setTimeout(r, 30))
    handle.release()
  }
  return [...ids.values()]
}
