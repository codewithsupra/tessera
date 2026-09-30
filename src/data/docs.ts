import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'

/**
 * Each page is one Y.Doc persisted to IndexedDB, so it opens instantly and works offline.
 *   - 'title'   Y.Text        page title (mirrored into the local page index)
 *   - 'content' Y.XmlFragment the TipTap document
 * Docs are ref-counted so several components can share one open doc.
 */
type Entry = { doc: Y.Doc; persistence: IndexeddbPersistence; ready: Promise<void>; refs: number }

const open = new Map<string, Entry>()

export const docName = (pageId: string) => `tessera-doc-${pageId}`

export type DocHandle = { doc: Y.Doc; ready: Promise<void>; release: () => void }

export function openDoc(pageId: string): DocHandle {
  let entry = open.get(pageId)
  if (!entry) {
    const doc = new Y.Doc({ guid: pageId })
    const persistence = new IndexeddbPersistence(docName(pageId), doc)
    const ready = persistence.whenSynced.then(() => undefined)
    entry = { doc, persistence, ready, refs: 0 }
    open.set(pageId, entry)
  }
  entry.refs++
  const e = entry
  let released = false
  return {
    doc: e.doc,
    ready: e.ready,
    release: () => {
      if (released) return
      released = true
      e.refs--
      if (e.refs === 0) {
        open.delete(pageId)
        void e.persistence.destroy().then(() => e.doc.destroy())
      }
    },
  }
}

/** Applies `next` to a Y.Text as a minimal edit so concurrent title edits merge instead of clobbering. */
export function applyTextDiff(text: Y.Text, next: string): void {
  const prev = text.toString()
  if (prev === next) return
  let start = 0
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++
  let endPrev = prev.length
  let endNext = next.length
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--
    endNext--
  }
  text.doc?.transact(() => {
    if (endPrev > start) text.delete(start, endPrev - start)
    if (endNext > start) text.insert(start, next.slice(start, endNext))
  })
}
