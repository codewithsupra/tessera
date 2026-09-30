import { db } from './db'
import { descendantIds, nextOrder, type PageRow } from './tree'

export async function listPages(workspaceId: string): Promise<PageRow[]> {
  return db.pages.where('workspaceId').equals(workspaceId).toArray()
}

export async function createPage(workspaceId: string, parentId: string | null = null): Promise<PageRow> {
  return db.transaction('rw', db.pages, async () => {
    const rows = await listPages(workspaceId)
    const now = Date.now()
    const page: PageRow = {
      id: crypto.randomUUID(),
      workspaceId,
      parentId,
      title: '',
      icon: null,
      kind: 'page',
      order: nextOrder(rows, parentId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await db.pages.add(page)
    return page
  })
}

export async function setPageTitle(id: string, title: string): Promise<void> {
  const page = await db.pages.get(id)
  if (!page || page.title === title) return
  await db.pages.update(id, { title, updatedAt: Date.now() })
}

/** Moves a page and everything under it to Trash. */
export async function trashPage(id: string): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = await db.pages.get(id)
    if (!page) return
    const rows = await listPages(page.workspaceId)
    const now = Date.now()
    const ids = descendantIds(rows, id).filter((d) => rows.find((r) => r.id === d)?.deletedAt === null)
    await Promise.all(ids.map((d) => db.pages.update(d, { deletedAt: now, updatedAt: now })))
  })
}

/** Restores a page and the descendants that were trashed along with it. */
export async function restorePage(id: string): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = await db.pages.get(id)
    if (!page || page.deletedAt === null) return
    const rows = await listPages(page.workspaceId)
    const stamp = page.deletedAt
    const ids = descendantIds(rows, id).filter((d) => rows.find((r) => r.id === d)?.deletedAt === stamp)
    const parent = page.parentId ? rows.find((r) => r.id === page.parentId) : undefined
    const now = Date.now()
    await Promise.all(ids.map((d) => db.pages.update(d, { deletedAt: null, updatedAt: now })))
    // If the parent is still in Trash, bring the page back at the top level.
    if (parent && parent.deletedAt !== null) {
      await db.pages.update(id, { parentId: null, order: nextOrder(rows, null) })
    }
  })
}
