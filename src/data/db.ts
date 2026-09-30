import Dexie, { type Table } from 'dexie'
import type { PageRow } from './tree'
import { getScopeUser, onScopeChange, setScopeUser } from './scopeName'

/**
 * Local index of pages. Page *content* lives in per-page Yjs docs (see docs.ts);
 * this table is the fast, queryable metadata the sidebar, search and views read.
 */
export type MetaRow = { key: string; value: string }

class TesseraDB extends Dexie {
  pages!: Table<PageRow, string>
  meta!: Table<MetaRow, string>

  constructor(name: string) {
    super(name)
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

const nameFor = (userId: string | null) => (userId ? `tessera-${userId}` : 'tessera')

/**
 * The signed-in user's local database. Each account on a device gets its own, so switching
 * accounts never mixes (or purges) another person's offline data. A live binding: importers
 * always see the current one.
 */
export let db = new TesseraDB(nameFor(getScopeUser()))

function reopen(userId: string | null) {
  const name = nameFor(userId)
  if (db.name === name) return
  db.close()
  db = new TesseraDB(name)
}
onScopeChange(reopen)

/** Switches the active user's database (tests and the storage scope). */
export function scopeDb(userId: string | null): void {
  setScopeUser(userId)
  reopen(userId)
}
