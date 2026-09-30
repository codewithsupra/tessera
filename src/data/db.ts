import Dexie, { type Table } from 'dexie'
import type { PageRow } from './tree'

/**
 * Local index of pages. Page *content* lives in per-page Yjs docs (see docs.ts);
 * this table is the fast, queryable metadata the sidebar, search and views read.
 */
export type MetaRow = { key: string; value: string }

class TesseraDB extends Dexie {
  pages!: Table<PageRow, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('tessera')
    this.version(1).stores({ pages: 'id, workspaceId, parentId, updatedAt' })
    // v2 (M3 sync): dirty flags for push, a meta table for pull cursors.
    this.version(2)
      .stores({ pages: 'id, workspaceId, parentId, updatedAt, [workspaceId+dirty], [workspaceId+docDirty]', meta: 'key' })
      .upgrade((tx) =>
        tx
          .table('pages')
          .toCollection()
          .modify((p: PageRow) => {
            p.dirty = 1
            p.docDirty = 1
          }),
      )
  }
}

export const db = new TesseraDB()
