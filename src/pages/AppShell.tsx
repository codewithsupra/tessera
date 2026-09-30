import { Link, Outlet, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { FilePlus2, Menu, PanelLeft, Search, X } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { takeRememberedNext } from '../auth/next'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { GuestBanner } from '../components/GuestBanner'
import { ShortcutsHelp } from '../components/ShortcutsHelp'
import { matchShortcut } from '../lib/shortcuts'
import { Sidebar } from '../components/Sidebar'
import { track } from '../lib/telemetry'
import { SyncManager } from '../sync/SyncManager'
import { db } from '../data/db'
import { createPage, listPages } from '../data/pages'
import { displayTitle } from '../data/tree'
import { useUiStore } from '../data/uiStore'
import { useWorkspaceId } from '../data/workspace'
import { canEdit } from '../data/workspaces'
import { useAuth } from '../auth/context'
import { useSyncStore } from '../sync/syncStore'
import { insforge } from '../lib/insforge'
import { switchWorkspace } from '../sync/workspaceActions'

// The editor stack (TipTap, ProseMirror, Yjs) is the bulk of the bundle; load it only when a page opens.
const PageEditor = lazy(() => import('../editor/PageEditor').then((m) => ({ default: m.PageEditor })))

const CommandPalette = lazy(() => import('../components/CommandPalette').then((m) => ({ default: m.CommandPalette })))

export function AppLayout() {
  const open = useUiStore((s) => s.sidebarOpen)
  const setOpen = useUiStore((s) => s.setSidebarOpen)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const paletteOpen = useUiStore((s) => s.dialog === 'palette')
  const navigate = useNavigate()
  const ws = useWorkspaceId()
  const editable = canEdit(useSyncStore((s) => s.role))

  // App-wide keyboard shortcuts (see lib/shortcuts.ts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const id = matchShortcut(e)
      if (!id) return
      const ui = useUiStore.getState()
      if (id === 'palette') ui.setDialog(ui.dialog === 'palette' ? null : 'palette')
      else if (id === 'help') ui.setDialog('shortcuts')
      else if (id === 'toggleSidebar') ui.toggleSidebar()
      else if (id === 'newPage') {
        if (!editable) return
        void createPage(ws).then((page) => {
          track('page_created', { from: 'shortcut' })
          return navigate({ to: '/app/p/$pageId', params: { pageId: page.id } })
        })
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ws, editable, navigate])

  // Continue where an OAuth sign-in started (e.g. an invite link).
  useEffect(() => {
    const next = takeRememberedNext()
    if (next) void navigate({ to: next })
  }, [navigate])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-plaster">
        Skip to content
      </a>
      <SyncManager />
      {!collapsed && (
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line md:block" aria-label="Sidebar">
          <Sidebar />
        </aside>
      )}
      {collapsed && (
        <button
          onClick={() => useUiStore.getState().toggleSidebar()}
          className="fixed left-3 top-3 z-30 hidden rounded-md border border-line bg-surface p-2 text-ink-soft shadow-sm hover:text-ink md:block"
          aria-label="Show sidebar"
          title="Show sidebar"
        >
          <PanelLeft size={18} aria-hidden="true" />
        </button>
      )}

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
          <button onClick={() => useUiStore.getState().setDialog('palette')} className="ml-auto rounded-md p-2 text-ink-soft hover:bg-plaster-deep" aria-label="Search pages and commands">
            <Search size={20} aria-hidden="true" />
          </button>
        </header>
        <GuestBanner />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          <Outlet />
        </main>
      </div>
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
      <ShortcutsHelp />
    </div>
  )
}

export function AppHome() {
  const ws = useWorkspaceId()
  const editable = canEdit(useSyncStore((s) => s.role))
  const navigate = useNavigate()
  const recent = useLiveQuery(
    async () => (await listPages(ws)).filter((p) => p.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [ws],
  )

  async function newPage() {
    const page = await createPage(ws)
    track('page_created', { from: 'home' })
    await navigate({ to: '/app/p/$pageId', params: { pageId: page.id } })
  }

  const bootstrapping = useSyncStore((s) => s.bootstrapping)
  if (!recent) return null
  if (bootstrapping && recent.length === 0) {
    return (
      <div className="flex min-h-[70dvh] items-center justify-center text-ink-soft" role="status" aria-live="polite">
        Setting up your workspace…
      </div>
    )
  }

  if (recent.length === 0) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl font-medium tracking-tight">This workspace is empty</h1>
        <p className="mt-3 max-w-sm text-ink-soft">
          {editable
            ? 'Pages you create are saved on this device first, so they open instantly and work offline.'
            : 'Nothing has been shared here yet. Pages will appear as soon as someone adds them.'}
        </p>
        {editable && <button onClick={newPage} className="mt-6 inline-flex items-center gap-2 rounded-md bg-lapis px-4 py-2.5 text-[15px] font-medium text-plaster hover:opacity-90">
          <FilePlus2 size={18} aria-hidden="true" /> New page
        </button>}
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
      {editable && (
        <button onClick={newPage} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-lapis hover:underline">
          <FilePlus2 size={16} aria-hidden="true" /> New page
        </button>
      )}
    </div>
  )
}

export function PageView({ pageId }: { pageId: string }) {
  const ws = useWorkspaceId()
  const { user } = useAuth()
  const myWorkspaces = useSyncStore((s) => s.workspaces)
  // undefined = still loading, null = not found
  const page = useLiveQuery(async () => (await db.pages.get(pageId)) ?? null, [pageId])

  useEffect(() => {
    document.title = page ? `${displayTitle(page.title)} · Tessera` : 'Tessera'
    return () => {
      document.title = 'Tessera'
    }
  }, [page])

  // The page may belong to another of my workspaces — known locally, or (fresh device) only
  // to the server. RLS answers only for members, so a hit is always one I may open.
  const [remoteWs, setRemoteWs] = useState<string | null | undefined>(undefined)
  const localOther = page && page.workspaceId !== ws ? page.workspaceId : null
  useEffect(() => {
    if (page !== null) return
    let cancelled = false
    insforge.database
      .from('pages')
      .select('workspace_id')
      .eq('id', pageId)
      .maybeSingle()
      .then(({ data }) => !cancelled && setRemoteWs((data as { workspace_id: string } | null)?.workspace_id ?? null))
    return () => {
      cancelled = true
    }
  }, [page, pageId])

  const target = localOther ?? (page === null ? remoteWs : null)
  const canSwitch = !!target && target !== ws && myWorkspaces.some((w) => w.id === target)
  useEffect(() => {
    if (canSwitch && user && target) switchWorkspace(user.id, target)
  }, [canSwitch, user, target])

  const lookingUp = page === null && remoteWs === undefined
  if (page === undefined || canSwitch || lookingUp) return <div className="mx-auto h-40 max-w-[720px]" aria-busy="true" />
  if (!page || page.workspaceId !== ws) {
    return (
      <div className="px-6 pt-24 text-center">
        <h1 className="font-display text-2xl font-medium">This page isn't available</h1>
        <p className="mt-2 text-ink-soft">It may have been deleted, or it’s in a workspace you haven’t been invited to.</p>
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
  return (
    <ErrorBoundary key={pageId} label="page">
      <PageView pageId={pageId} />
    </ErrorBoundary>
  )
}
