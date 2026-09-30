import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, FileText, LogOut, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/context'
import { createPage, listPages, restorePage, trashPage } from '../data/pages'
import { buildTree, descendantIds, displayTitle, trashRoots, type PageRow, type TreeNode } from '../data/tree'
import { useUiStore } from '../data/uiStore'
import { useWorkspaceId } from '../data/workspace'
import { Logo } from './Logo'

const iconBtn = 'flex h-6 w-6 items-center justify-center rounded text-ink-faint hover:bg-line/60 hover:text-ink'

export function Sidebar() {
  const ws = useWorkspaceId()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const rows = useLiveQuery(() => listPages(ws), [ws])
  const [trashOpen, setTrashOpen] = useState(false)
  const closeMobile = () => useUiStore.getState().setSidebarOpen(false)

  async function newPage(parentId: string | null = null) {
    const page = await createPage(ws, parentId)
    if (parentId) useUiStore.getState().expand(parentId)
    closeMobile()
    await navigate({ to: '/app/p/$pageId', params: { pageId: page.id } })
  }

  async function onSignOut() {
    await signOut()
    await navigate({ to: '/' })
  }

  const tree = rows ? buildTree(rows) : []
  const trash = rows ? trashRoots(rows) : []

  return (
    <nav aria-label="Pages" className="flex h-full flex-col bg-plaster-deep/60 px-2.5 py-4">
      <div className="px-2">
        <Link to="/app" onClick={closeMobile} aria-label="Workspace home">
          <Logo size={24} />
        </Link>
        <p className="mt-5 truncate text-sm font-medium text-ink">{user?.name ?? user?.email}</p>
        <p className="truncate text-xs text-ink-faint">Personal workspace · on this device</p>
      </div>

      <button
        onClick={() => newPage()}
        className="mx-1 mt-5 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink-soft hover:bg-line/50 hover:text-ink"
      >
        <Plus size={16} aria-hidden="true" /> New page
      </button>

      <div className="mt-2 flex-1 overflow-y-auto">
        {rows && tree.length === 0 && <p className="px-3 py-2 text-sm text-ink-faint">No pages yet.</p>}
        <ul role="tree" aria-label="Page tree">
          {tree.map((n) => (
            <TreeRow key={n.id} node={n} depth={0} rows={rows ?? []} onAdd={newPage} />
          ))}
        </ul>
      </div>

      <div className="border-t border-line pt-2">
        <button
          onClick={() => setTrashOpen((o) => !o)}
          aria-expanded={trashOpen}
          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-line/50 hover:text-ink"
        >
          <Trash2 size={15} aria-hidden="true" /> Trash{trash.length > 0 && <span className="ml-auto text-xs text-ink-faint">{trash.length}</span>}
        </button>
        {trashOpen && (
          <ul className="mb-2 max-h-48 overflow-y-auto" aria-label="Trash">
            {trash.length === 0 && <li className="px-3 py-1.5 text-sm text-ink-faint">Trash is empty.</li>}
            {trash.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-md px-3 py-1 text-sm text-ink-soft">
                <span className="flex-1 truncate">{displayTitle(p.title)}</span>
                <button onClick={() => restorePage(p.id)} className={iconBtn} aria-label={`Restore ${displayTitle(p.title)}`} title="Restore">
                  <RotateCcw size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button onClick={onSignOut} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-line/50 hover:text-ink">
          <LogOut size={15} aria-hidden="true" /> Sign out
        </button>
      </div>
    </nav>
  )
}

function TreeRow({ node, depth, rows, onAdd }: { node: TreeNode; depth: number; rows: PageRow[]; onAdd: (parentId: string) => void }) {
  const expanded = useUiStore((s) => !!s.expanded[node.id])
  const toggle = useUiStore((s) => s.toggle)
  const params = useParams({ strict: false }) as { pageId?: string }
  const navigate = useNavigate()
  const active = params.pageId === node.id
  const title = displayTitle(node.title)

  async function onTrash() {
    const containsActive = params.pageId ? descendantIds(rows, node.id).includes(params.pageId) : false
    await trashPage(node.id)
    if (containsActive) await navigate({ to: '/app' })
  }

  return (
    <li role="treeitem" aria-expanded={node.children.length ? expanded : undefined} aria-selected={active}>
      <div
        className={`group flex items-center gap-0.5 rounded-md pr-1 text-sm ${active ? 'bg-lapis-soft text-ink' : 'text-ink-soft hover:bg-line/50 hover:text-ink'}`}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button onClick={() => toggle(node.id)} className={`${iconBtn} ${node.children.length ? '' : 'invisible'}`} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`} tabIndex={node.children.length ? 0 : -1}>
          <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
        <Link
          to="/app/p/$pageId"
          params={{ pageId: node.id }}
          onClick={() => useUiStore.getState().setSidebarOpen(false)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5"
        >
          <FileText size={15} className="shrink-0 opacity-60" aria-hidden="true" />
          <span className={`truncate ${node.title.trim() ? '' : 'text-ink-faint'}`}>{title}</span>
        </Link>
        <span className="flex opacity-0 focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
          <button onClick={() => onAdd(node.id)} className={iconBtn} aria-label={`Add a page inside ${title}`} title="Add a page inside">
            <Plus size={14} aria-hidden="true" />
          </button>
          <button onClick={onTrash} className={iconBtn} aria-label={`Move ${title} to Trash`} title="Move to Trash">
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </span>
      </div>
      {expanded && node.children.length > 0 && (
        <ul role="group">
          {node.children.map((c) => (
            <TreeRow key={c.id} node={c} depth={depth + 1} rows={rows} onAdd={onAdd} />
          ))}
        </ul>
      )}
    </li>
  )
}
