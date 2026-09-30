import { Link } from '@tanstack/react-router'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Logo } from '../components/Logo'
import { TryGuestButton } from '../components/TryGuestButton'
import { track } from '../lib/telemetry'

type Tile = {
  area: string
  kind: 'note' | 'lapis' | 'verdigris' | 'gold' | 'plain'
  title?: string
  line?: string
  cursor?: string
}

// The hero mosaic: each tile is a page in someone's workspace.
const tiles: Tile[] = [
  { area: '1 / 1 / 3 / 3', kind: 'note', title: 'Launch plan', line: 'Ship the beta to 40 design partners by Friday.', cursor: 'Asha' },
  { area: '1 / 3 / 2 / 4', kind: 'lapis' },
  { area: '1 / 4 / 2 / 5', kind: 'note', title: 'Reading list', line: '3 links' },
  { area: '2 / 3 / 4 / 5', kind: 'note', title: 'Interview notes', line: 'Everyone exports to Markdown eventually.', cursor: 'Leo' },
  { area: '3 / 1 / 4 / 2', kind: 'verdigris' },
  { area: '3 / 2 / 4 / 3', kind: 'note', title: 'Journal', line: 'Written offline.' },
  { area: '4 / 1 / 5 / 3', kind: 'note', title: 'Roadmap', line: '12 items · board view' },
  { area: '4 / 3 / 5 / 4', kind: 'gold' },
  { area: '4 / 4 / 5 / 5', kind: 'plain' },
]

const fill: Record<Tile['kind'], string> = {
  note: 'bg-surface border border-line',
  lapis: 'bg-lapis',
  verdigris: 'bg-verdigris',
  gold: 'bg-gold',
  plain: 'bg-plaster-deep',
}

function Mosaic() {
  return (
    <div
      className="grid aspect-square w-full max-w-[520px] grid-cols-4 grid-rows-4 gap-2.5"
      aria-label="A workspace of notes arranged as a mosaic"
      role="img"
    >
      {tiles.map((t, i) => (
        <div
          key={i}
          className={`tile-settle relative overflow-hidden rounded-lg p-3.5 ${fill[t.kind]}`}
          style={{ gridArea: t.area, animationDelay: `${i * 55}ms` }}
        >
          {t.title && (
            <>
              <p className="font-display text-[15px] font-semibold leading-snug text-ink">{t.title}</p>
              <p className="mt-1 text-[13px] leading-snug text-ink-soft">{t.line}</p>
            </>
          )}
          {t.cursor && (
            <span className="absolute bottom-3 right-3 rounded-full bg-verdigris px-2 py-0.5 text-[11px] font-medium text-plaster">
              {t.cursor} is editing
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

const CrdtDemo = lazy(() => import('../landing/CrdtDemo').then((m) => ({ default: m.CrdtDemo })))

/** Loads the (editor-heavy) demo only when it's about to scroll into view. */
function DemoSlot() {
  const ref = useRef<HTMLDivElement>(null)
  // Without IntersectionObserver (very old browsers), just load it.
  const [show, setShow] = useState(() => typeof window !== 'undefined' && !('IntersectionObserver' in window))
  useEffect(() => {
    const el = ref.current
    if (!el || show) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setShow(true), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [show])
  return (
    <div ref={ref} className="min-h-[330px]">
      {show && (
        <Suspense fallback={<div className="h-[330px] rounded-xl border border-line bg-surface" aria-busy="true" />}>
          <CrdtDemo />
        </Suspense>
      )}
    </div>
  )
}

const FEATURES = [
  { title: 'Local-first', body: 'Every page is stored on your device first. It opens instantly and you can keep writing on a plane.' },
  { title: 'Live multiplayer', body: 'See teammates’ cursors as they type. Edits merge automatically — no “someone else is editing” locks.' },
  { title: 'Workspaces and roles', body: 'Invite people as editors or viewers with single-use links. Access is enforced by the database, not just the UI.' },
  { title: 'Plain Markdown, always', body: 'Export a page or a whole workspace as .md files with your folder structure. No lock-in.' },
  { title: 'Installable and offline', body: 'Install it like an app. Close the laptop mid-sentence; it syncs when you’re back.' },
  { title: 'Private by design', body: 'Row-level security on every table and first-party analytics only — no third-party trackers.' },
]

export function Landing() {
  useEffect(() => track('landing_viewed'), [])
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          <Link to="/engineering" className="hidden rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink sm:block">
            How it’s built
          </Link>
          <a href="https://github.com/codewithsupra/tessera" className="hidden rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink sm:block">
            GitHub
          </a>
          <Link to="/signin" className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">
            Sign in
          </Link>
          <Link to="/signup" className="rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-plaster hover:opacity-90">
            Create account
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <h1 className="font-display text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[1.02] tracking-[-0.02em] text-ink">
              Your notes stay yours. Your team still writes with you.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-soft">
              Tessera opens instantly and keeps working offline, because every page lives on your device first. Invite people to a workspace and edit the same page
              together, live. Export everything as plain Markdown whenever you want.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <TryGuestButton className="rounded-md bg-lapis px-5 py-3 text-[15px] font-medium text-plaster hover:opacity-90 disabled:opacity-70" />
              <Link to="/signup" className="rounded-md border border-line px-5 py-3 text-[15px] font-medium text-ink hover:bg-surface">
                Create an account
              </Link>
            </div>
            <p className="mt-3 text-sm text-ink-faint">The guest workspace comes with sample pages. Keep it by adding an email later.</p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <Mosaic />
          </div>
        </section>

        <section className="border-y border-line bg-plaster-deep/40" aria-labelledby="demo-heading">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <h2 id="demo-heading" className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
              Cut the network. Keep typing. Watch it merge.
            </h2>
            <p className="mt-3 max-w-2xl text-ink-soft">
              These two notes run Tessera’s real sync engine in your browser, against an in-memory server. Take a device offline, edit both, and reconnect — every
              keystroke survives, in the same order on both screens.
            </p>
            <div className="mt-8">
              <DemoSlot />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8" aria-labelledby="features-heading">
          <h2 id="features-heading" className="font-display text-3xl font-medium tracking-tight">
            Obsidian’s speed and ownership. Notion’s collaboration.
          </h2>
          <ul className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <h3 className="font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 leading-relaxed text-ink-soft">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8" aria-labelledby="built-heading">
          <div className="rounded-2xl border border-line bg-surface p-8 sm:p-10">
            <h2 id="built-heading" className="font-display text-2xl font-medium tracking-tight">
              How it’s built
            </h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-ink-soft">
              Each page is a Yjs CRDT persisted in IndexedDB. Edits are appended to Postgres and a database trigger broadcasts them over websockets, so anything a
              collaborator receives is already durable. Offline devices reconcile with state vectors; compaction folds history into snapshots; row-level security
              guards every table and channel.
            </p>
            <Link to="/engineering" className="mt-5 inline-block font-medium text-lapis hover:underline">
              Read the engineering write-up
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-ink-faint sm:px-8">
          <span>Built by Supratim Sarkar with React, Yjs and InsForge.</span>
          <nav className="flex gap-4" aria-label="Footer">
            <Link to="/engineering" className="hover:text-ink">Engineering</Link>
            <a href="https://github.com/codewithsupra/tessera" className="hover:text-ink">Source code</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
