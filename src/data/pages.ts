import { db } from './db'
import { descendantIds, nextOrder, type PageRow } from './tree'

// The sync engine registers here to hear about local metadata changes (no-op until then).
let onLocalChange: () => void = () => {}
export function setLocalChangeListener(fn: () => void) {
  onLocalChange = fn
}

/** Strictly increasing edit time, so two edits in the same millisecond still order correctly. */
export function nextEditTime(previous: number): number {
  return Math.max(Date.now(), previous + 1)
}

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
      dirty: 1,
      docDirty: 0,
    }
    await db.pages.add(page)
    return page
  }).finally(() => onLocalChange())
}

export async function setPageTitle(id: string, title: string): Promise<void> {
  const page = await db.pages.get(id)
  if (!page || page.title === title) return
  await db.pages.update(id, { title, updatedAt: nextEditTime(page.updatedAt), dirty: 1 })
  onLocalChange()
}

/** Moves a page and everything under it to Trash. */
export async function trashPage(id: string): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = await db.pages.get(id)
    if (!page) return
    const rows = await listPages(page.workspaceId)
    const now = Date.now()
    const ids = descendantIds(rows, id).filter((d) => rows.find((r) => r.id === d)?.deletedAt === null)
    await Promise.all(
      ids.map((d) => db.pages.update(d, { deletedAt: now, updatedAt: nextEditTime(rows.find((r) => r.id === d)!.updatedAt), dirty: 1 })),
    )
  })
  onLocalChange()
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
    await Promise.all(
      ids.map((d) => db.pages.update(d, { deletedAt: null, updatedAt: nextEditTime(rows.find((r) => r.id === d)!.updatedAt), dirty: 1 })),
    )
    // If the parent is still in Trash, bring the page back at the top level.
    if (parent && parent.deletedAt !== null) {
      await db.pages.update(id, { parentId: null, order: nextOrder(rows, null) })
    }
  })
  onLocalChange()
}

const lastTouch = new Map<string, number>()
export const TOUCH_INTERVAL_MS = 60_000

/**
 * Marks a page as edited because its *content* changed, so "recently edited" and exported
 * `updated` dates reflect body edits. Throttled per page: typing doesn't flood metadata sync.
 */
export async function touchPage(id: string, now = Date.now()): Promise<boolean> {
  const last = lastTouch.get(id) ?? 0
  if (now - last < TOUCH_INTERVAL_MS) return false
  lastTouch.set(id, now)
  const page = await db.pages.get(id)
  if (!page) return false
  await db.pages.update(id, { updatedAt: nextEditTime(page.updatedAt), dirty: 1 })
  onLocalChange()
  return true
}
