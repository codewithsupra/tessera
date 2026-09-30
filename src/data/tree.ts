export type PageRow = {
  id: string
  workspaceId: string
  parentId: string | null
  title: string
  icon: string | null
  kind: 'page' | 'database'
  order: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  /** 1 = metadata changed locally and not yet confirmed by the server. */
  dirty?: 0 | 1
  /** 1 = document content has local edits the server may not have. */
  docDirty?: 0 | 1
}

export type TreeNode = PageRow & { children: TreeNode[] }

/** Builds the sidebar tree from flat rows. Trashed pages (and anything under them) are hidden. */
export function buildTree(rows: PageRow[]): TreeNode[] {
  const live = rows.filter((r) => r.deletedAt === null)
  const byId = new Map<string, TreeNode>(live.map((r) => [r.id, { ...r, children: [] }]))
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    if (node.parentId === null) roots.push(node)
    else byId.get(node.parentId)?.children.push(node)
  }
  const sort = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
    nodes.forEach((n) => sort(n.children))
    return nodes
  }
  return sort(roots)
}

/** Ids of a page and all of its descendants. */
export function descendantIds(rows: PageRow[], rootId: string): string[] {
  const kids = new Map<string, string[]>()
  for (const r of rows) {
    if (r.parentId) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r.id])
  }
  const out: string[] = []
  const stack = [rootId]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    stack.push(...(kids.get(id) ?? []))
  }
  return out
}

/** Order value that places a new page after its last live sibling. */
export function nextOrder(rows: PageRow[], parentId: string | null): number {
  const siblings = rows.filter((r) => r.parentId === parentId && r.deletedAt === null)
  return siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0
}

/** Trashed pages whose parent is not also trashed — the ones to list in Trash. */
export function trashRoots(rows: PageRow[]): PageRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const parentTrashed = (r: PageRow) => {
    const parent = r.parentId ? byId.get(r.parentId) : undefined
    return parent !== undefined && parent.deletedAt !== null
  }
  return rows
    .filter((r) => r.deletedAt !== null && !parentTrashed(r))
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

/** Sidebar/tab label: trimmed title, or "Untitled" for a blank page. */
export function displayTitle(title: string): string {
  return title.trim() || 'Untitled'
}
