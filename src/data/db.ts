import Dexie, { type Table } from 'dexie'
import type { PageRow } from './tree'

/**
 * Local index of pages. Page *content* lives in per-page Yjs docs (see docs.ts);
 * this table is the fast, queryable metadata the sidebar, search and views read.
 */
class TesseraDB extends Dexie {
  pages!: Table<PageRow, string>

  constructor() {
    super('tessera')
    this.version(1).stores({ pages: 'id, workspaceId, parentId, updatedAt' })
  }
}

export const db = new TesseraDB()
