import 'fake-indexeddb/auto'
import { db } from './db'
import { createPage, listPages, nextEditTime, restorePage, setPageTitle, trashPage } from './pages'

beforeEach(async () => {
  await db.pages.clear()
})

describe('nextEditTime', () => {
  it('never goes backwards or repeats', () => {
    const future = Date.now() + 60_000
    expect(nextEditTime(future)).toBe(future + 1)
    expect(nextEditTime(0)).toBeGreaterThan(0)
  })
})

describe('pages store', () => {
  it('creates pages in order within a workspace', async () => {
    const a = await createPage('w1')
    const b = await createPage('w1')
    const child = await createPage('w1', a.id)
    await createPage('w2')
    expect([a.order, b.order, child.order]).toEqual([0, 1, 0])
    expect((await listPages('w1')).length).toBe(3)
    expect(child.parentId).toBe(a.id)
  })

  it('updates the title and bumps updatedAt, ignoring no-op writes', async () => {
    const p = await createPage('w1')
    await new Promise((r) => setTimeout(r, 2))
    await setPageTitle(p.id, 'Launch plan')
    const after = await db.pages.get(p.id)
    expect(after?.title).toBe('Launch plan')
    expect(after!.updatedAt).toBeGreaterThan(p.updatedAt)
    await setPageTitle(p.id, 'Launch plan')
    expect((await db.pages.get(p.id))?.updatedAt).toBe(after!.updatedAt)
  })

  it('keeps edit times strictly increasing within one millisecond', async () => {
    const p = await createPage('w1')
    await setPageTitle(p.id, 'a')
    await setPageTitle(p.id, 'b')
    await setPageTitle(p.id, 'c')
    expect((await db.pages.get(p.id))!.updatedAt).toBeGreaterThanOrEqual(p.updatedAt + 3)
  })

  it('trashes a page with its subtree and restores it', async () => {
    const a = await createPage('w1')
    const a1 = await createPage('w1', a.id)
    const other = await createPage('w1')
    await trashPage(a.id)
    const trashed = await listPages('w1')
    expect(trashed.find((r) => r.id === a.id)?.deletedAt).not.toBeNull()
    expect(trashed.find((r) => r.id === a1.id)?.deletedAt).not.toBeNull()
    expect(trashed.find((r) => r.id === other.id)?.deletedAt).toBeNull()

    await restorePage(a.id)
    const restored = await listPages('w1')
    expect(restored.every((r) => r.deletedAt === null)).toBe(true)
  })

  it('does not restore a child that was trashed separately earlier', async () => {
    const a = await createPage('w1')
    const a1 = await createPage('w1', a.id)
    await trashPage(a1.id)
    await new Promise((r) => setTimeout(r, 2))
    await trashPage(a.id)
    await restorePage(a.id)
    const rows = await listPages('w1')
    expect(rows.find((r) => r.id === a.id)?.deletedAt).toBeNull()
    expect(rows.find((r) => r.id === a1.id)?.deletedAt).not.toBeNull()
  })

  it('restores a child to the top level when its parent is still in Trash', async () => {
    const a = await createPage('w1')
    const a1 = await createPage('w1', a.id)
    await trashPage(a1.id)
    await new Promise((r) => setTimeout(r, 2))
    await trashPage(a.id)
    await restorePage(a1.id)
    const child = (await listPages('w1')).find((r) => r.id === a1.id)
    expect(child?.deletedAt).toBeNull()
    expect(child?.parentId).toBeNull()
  })
})

describe('per-user database', () => {
  it('switches databases by user, leaving the other user’s rows untouched', async () => {
    const mod = await import('./db')
    mod.scopeDb('alice')
    await createPage('w-alice')
    mod.scopeDb('bob')
    expect(await mod.db.pages.count()).toBe(0)
    mod.scopeDb('alice')
    expect(await mod.db.pages.count()).toBe(1)
    mod.scopeDb(null)
  })
})
