import { buildTree, descendantIds, displayTitle, nextOrder, trashRoots, type PageRow } from './tree'

let t = 0
function row(id: string, parentId: string | null, extra: Partial<PageRow> = {}): PageRow {
  t++
  return { id, workspaceId: 'w', parentId, title: id, icon: null, kind: 'page', order: 0, createdAt: t, updatedAt: t, deletedAt: null, ...extra }
}

describe('buildTree', () => {
  it('nests children and sorts by order then creation', () => {
    const tree = buildTree([row('b', null, { order: 1 }), row('a', null, { order: 0 }), row('a2', 'a'), row('a1', 'a', { order: -1 })])
    expect(tree.map((n) => n.id)).toEqual(['a', 'b'])
    expect(tree[0].children.map((n) => n.id)).toEqual(['a1', 'a2'])
  })
  it('hides trashed pages and everything under them', () => {
    const tree = buildTree([row('a', null, { deletedAt: 5 }), row('a1', 'a'), row('b', null)])
    expect(tree.map((n) => n.id)).toEqual(['b'])
  })
  it('drops children whose parent is missing instead of crashing', () => {
    expect(buildTree([row('x', 'ghost')])).toEqual([])
  })
})

describe('descendantIds', () => {
  it('returns the root and all descendants', () => {
    const rows = [row('a', null), row('b', 'a'), row('c', 'b'), row('d', null)]
    expect(descendantIds(rows, 'a').sort()).toEqual(['a', 'b', 'c'])
  })
  it('terminates on a corrupted cycle', () => {
    const rows = [row('a', 'b'), row('b', 'a')]
    expect(descendantIds(rows, 'a').sort()).toEqual(['a', 'b'])
  })
})

describe('nextOrder', () => {
  it('appends after the last live sibling', () => {
    const rows = [row('a', null, { order: 3 }), row('b', null, { order: 9, deletedAt: 1 }), row('c', 'a', { order: 7 })]
    expect(nextOrder(rows, null)).toBe(4)
    expect(nextOrder(rows, 'a')).toBe(8)
    expect(nextOrder(rows, 'c')).toBe(0)
  })
})

describe('trashRoots', () => {
  it('lists only the top-most trashed pages, newest first', () => {
    const rows = [row('a', null, { deletedAt: 5 }), row('a1', 'a', { deletedAt: 5 }), row('b', null, { deletedAt: 9 }), row('c', null)]
    expect(trashRoots(rows).map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('displayTitle', () => {
  it('falls back to Untitled', () => {
    expect(displayTitle('   ')).toBe('Untitled')
    expect(displayTitle(' Plan ')).toBe('Plan')
  })
})
