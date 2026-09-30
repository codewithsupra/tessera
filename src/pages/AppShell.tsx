import { Link, Outlet, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { FilePlus2, Menu, X } from 'lucide-react'
import { Suspense, lazy, useEffect } from 'react'
import { Sidebar } from '../components/Sidebar'
import { db } from '../data/db'
import { createPage, listPages } from '../data/pages'
import { displayTitle } from '../data/tree'
import { useUiStore } from '../data/uiStore'
import { useWorkspaceId } from '../data/workspace'

// The editor stack (TipTap, ProseMirror, Yjs) is the bulk of the bundle; load it only when a page opens.
const PageEditor = lazy(() => import('../editor/PageEditor').then((m) => ({ default: m.PageEditor })))

export function AppLayout() {
  const open = useUiStore((s) => s.sidebarOpen)
  const setOpen = useUiStore((s) => s.setSidebarOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line md:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Pages">
          <button className="absolute inset-0 bg-ink/30" aria-label="Close pages" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-plaster shadow-xl">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2 md:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-2 text-ink-soft hover:bg-plaster-deep" aria-label="Open pages">
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
          <Link to="/app" className="font-display text-lg font-semibold">
            Tessera
          </Link>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function AppHome() {
  const ws = useWorkspaceId()
  const navigate = useNavigate()
  const recent = useLiveQuery(
    async () => (await listPages(ws)).filter((p) => p.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [ws],
  )

  async function newPage() {
    const page = await createPage(ws)
    await navigate({ to: '/app/p/$pageId', params: { pageId: page.id } })
  }

  if (!recent) return null

  if (recent.length === 0) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl font-medium tracking-tight">This workspace is empty</h1>
        <p className="mt-3 max-w-sm text-ink-soft">Pages you create are saved on this device first, so they open instantly and work offline.</p>
        <button onClick={newPage} className="mt-6 inline-flex items-center gap-2 rounded-md bg-lapis px-4 py-2.5 text-[15px] font-medium text-plaster hover:opacity-90">
          <FilePlus2 size={18} aria-hidden="true" /> New page
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[720px] px-5 pt-16 sm:px-12">
      <h1 className="font-display text-3xl font-medium tracking-tight">Recently edited</h1>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {recent.map((p) => (
          <li key={p.id}>
            <Link to="/app/p/$pageId" params={{ pageId: p.id }} className="flex items-baseline justify-between gap-4 py-3 hover:text-lapis">
              <span className={`truncate font-medium ${p.title.trim() ? '' : 'text-ink-faint'}`}>{displayTitle(p.title)}</span>
              <time className="shrink-0 text-sm text-ink-faint" dateTime={new Date(p.updatedAt).toISOString()}>
                {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </time>
            </Link>
          </li>
        ))}
      </ul>
      <button onClick={newPage} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-lapis hover:underline">
        <FilePlus2 size={16} aria-hidden="true" /> New page
      </button>
    </div>
  )
}

export function PageView({ pageId }: { pageId: string }) {
  const ws = useWorkspaceId()
  // undefined = still loading, null = not found
  const page = useLiveQuery(async () => (await db.pages.get(pageId)) ?? null, [pageId])

  useEffect(() => {
    document.title = page ? `${displayTitle(page.title)} · Tessera` : 'Tessera'
    return () => {
      document.title = 'Tessera'
    }
  }, [page])

  if (page === undefined) return null
  if (!page || page.workspaceId !== ws) {
    return (
      <div className="px-6 pt-24 text-center">
        <h1 className="font-display text-2xl font-medium">This page isn't in your workspace</h1>
        <p className="mt-2 text-ink-soft">It may have been deleted, or it lives on another device that hasn't synced yet.</p>
        <Link to="/app" className="mt-5 inline-block text-sm font-medium text-lapis hover:underline">
          Go to your workspace
        </Link>
      </div>
    )
  }
  if (page.deletedAt !== null) {
    return (
      <div className="px-6 pt-24 text-center">
        <h1 className="font-display text-2xl font-medium">{displayTitle(page.title)} is in Trash</h1>
        <p className="mt-2 text-ink-soft">Restore it from Trash in the sidebar to keep editing.</p>
      </div>
    )
  }
  return (
    <Suspense fallback={<div className="mx-auto h-40 max-w-[720px]" aria-busy="true" />}>
      <PageEditor pageId={pageId} />
    </Suspense>
  )
}

const pageRouteApi = getRouteApi('/app/p/$pageId')

export function PageRoute() {
  const { pageId } = pageRouteApi.useParams()
  return <PageView key={pageId} pageId={pageId} />
}
