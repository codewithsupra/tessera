import { Link } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import { Logo } from '../components/Logo'
import { STATS } from './engineeringStats'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-14">
      <h2 id={id} className="font-display text-2xl font-medium tracking-tight sm:text-[1.7rem]">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[1.0625rem] leading-[1.75] text-ink-soft [&_strong]:text-ink">{children}</div>
    </section>
  )
}

const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-plaster-deep px-1.5 py-0.5 text-[0.9em] text-ink">{children}</code>

/** Boxes and arrows drawn with theme tokens so the diagram works in light and dark. */
function Box({ x, y, w, h, title, lines, accent }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="var(--surface)" stroke={accent ? 'var(--lapis)' : 'var(--line)'} strokeWidth={accent ? 1.6 : 1} />
      <text x={x + 14} y={y + 24} fontSize={14} fontWeight={600} fill="var(--ink)">
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} x={x + 14} y={y + 46 + i * 19} fontSize={12.5} fill="var(--ink-soft)">
          {l}
        </text>
      ))}
    </g>
  )
}

function Arrow({ d, label, lx, ly }: { d: string; label?: string; lx?: number; ly?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke="var(--ink-faint)" strokeWidth={1.4} markerEnd="url(#arrow)" />
      {label && (
        <text x={lx} y={ly} fontSize={11.5} fill="var(--ink-faint)" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  )
}

function ArchitectureDiagram() {
  return (
    <figure className="mt-6">
      {/* Keeps labels legible on phones: the figure scrolls sideways instead of shrinking. */}
      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0" tabIndex={0} aria-label="Architecture diagram (scrolls sideways on small screens)">
      <svg viewBox="0 0 760 330" className="w-full min-w-[640px]" role="img" aria-labelledby="arch-title arch-desc">
        <title id="arch-title">Tessera architecture</title>
        <desc id="arch-desc">
          In each browser, the editor reads and writes a Yjs document persisted to IndexedDB. DocSync appends updates to Postgres through the API; a database trigger
          broadcasts each stored update over websockets to every other browser on the page.
        </desc>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-faint)" />
          </marker>
        </defs>
        <Box x={10} y={20} w={230} h={130} title="Ada’s browser" lines={['TipTap editor', 'Yjs document (CRDT)', 'IndexedDB — works offline', 'DocSync']} accent />
        <Box x={10} y={180} w={230} h={130} title="Leo’s browser" lines={['TipTap editor', 'Yjs document (CRDT)', 'IndexedDB — works offline', 'DocSync']} accent />
        <Box x={300} y={95} w={200} h={140} title="InsForge API" lines={['Auth (JWT)', 'PostgREST + RLS', 'Edge functions', 'Realtime websockets']} />
        <Box x={560} y={60} w={190} h={210} title="Postgres" lines={['pages (LWW metadata)', 'doc_updates (append-only)', 'doc_snapshots', 'workspace_access (RLS)', 'AFTER INSERT trigger', '→ realtime.publish()']} />
        <Arrow d="M240,70 C275,70 275,130 298,135" label="append update" lx={296} ly={62} />
        <Arrow d="M500,150 L558,150" label="insert" lx={529} ly={142} />
        <Arrow d="M558,215 C530,215 525,200 502,200" label="broadcast" lx={530} ly={232} />
        <Arrow d="M298,205 C275,215 270,250 242,250" label="y-update" lx={284} ly={268} />
      </svg>
      </div>
      <figcaption className="mt-2 text-sm text-ink-faint">Every update a collaborator receives has already been stored.</figcaption>
    </figure>
  )
}

function ReconcileDiagram() {
  const steps = [
    ['1', 'Offline edits land in the local Yjs doc and IndexedDB.', 'Nothing is queued separately — the doc is the queue.'],
    ['2', 'On reconnect, load snapshot + remaining updates into a scratch doc.', 'That scratch doc is exactly what the server knows.'],
    ['3', 'Diff: encodeStateAsUpdate(local, stateVector(server)).', 'Only what the server is missing is sent.'],
    ['4', 'Push the diff only if applying it would change the server.', 'State vectors ignore deletions, so the naive check resent the delete set every time.'],
  ]
  return (
    <ol className="mt-6 grid gap-3 sm:grid-cols-2">
      {steps.map(([n, title, note]) => (
        <li key={n} className="rounded-xl border border-line bg-surface p-4">
          <span className="font-display text-lg text-lapis">{n}</span>
          <p className="mt-1 font-medium text-ink">{title}</p>
          <p className="mt-1 text-sm text-ink-faint">{note}</p>
        </li>
      ))}
    </ol>
  )
}

const BUGS: [string, string][] = [
  [
    'Live updates were silently dropped.',
    'The realtime server reports channels as “realtime:doc:<id>”, while the docs show “doc:<id>”. Every filter rejected every message. Fixed by matching both forms, covered by a test, and reported upstream.',
  ],
  [
    'React StrictMode unsubscribed the live editor.',
    'The first mount’s cleanup finished after the second mount had subscribed to the same channel, and a channel subscription is per socket. Channels are now reference-counted.',
  ],
  [
    'Closing a page offline lost the “needs upload” flag.',
    'A failed flush emptied the queue, and the next empty flush declared success. Edits now stay “unconfirmed” until a resync proves the server has them.',
  ],
  [
    'Every page open re-uploaded the delete set.',
    'Yjs state vectors don’t describe deletions, so the diff always contained them. The fix applies the diff to a copy of server state and sends it only if something changes.',
  ],
  [
    'New accounts couldn’t get a workspace.',
    'After hardening a function to run with the caller’s privileges, INSERT … RETURNING had to pass a SELECT policy that only becomes true after an AFTER INSERT trigger. A live regression test now signs up a brand-new user on every run.',
  ],
  [
    'Two accounts on one laptop could purge each other’s offline data.',
    'All local data lived in one IndexedDB database. Each account now gets its own, and signing out reloads the app.',
  ],
  [
    'A laptop opened offline never synced again.',
    'The end-to-end suite found it: with no network at startup the session token was never refreshed, so after reconnecting every request was rejected. Session restore now retries when the browser comes back online.',
  ],
]

export function Engineering() {
  useEffect(() => {
    document.title = 'How Tessera is built · Tessera'
    return () => {
      document.title = 'Tessera'
    }
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" aria-label="Tessera home">
          <Logo />
        </Link>
        <a href="https://github.com/codewithsupra/tessera" className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">
          Source on GitHub
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-6 sm:px-8">
        <p className="text-sm text-ink-faint">Engineering write-up</p>
        <h1 className="mt-2 font-display text-[clamp(2.2rem,5vw,3.2rem)] font-medium leading-[1.08] tracking-[-0.015em]">How Tessera stays fast, offline and in sync</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-soft">
          Tessera is a local-first notes workspace: pages live on your device and sync to everyone else in real time. This page explains the sync protocol, the
          security model and how it’s tested — including the bugs that tests caught.
        </p>

        <dl className="mt-8 grid grid-cols-3 gap-4 rounded-xl border border-line bg-surface p-5 text-center">
          <div>
            <dt className="text-sm text-ink-faint">Unit tests</dt>
            <dd className="font-display text-2xl text-ink">{STATS.unitTests}+</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">Live security checks</dt>
            <dd className="font-display text-2xl text-ink">{STATS.liveChecks}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-faint">End-to-end flows</dt>
            <dd className="font-display text-2xl text-ink">{STATS.e2eFlows}</dd>
          </div>
        </dl>

        <Section id="local-first" title="Local-first by default">
          <p>
            Each page is a <strong>Yjs document</strong> — a CRDT — persisted to IndexedDB with <Code>y-indexeddb</Code>. The editor (TipTap) binds directly to that
            document, so opening a page never waits for the network and writing offline is the normal case, not an error state.
          </p>
          <p>
            A small <strong>Dexie</strong> index keeps page metadata (title, tree position, trash) for the sidebar, search and export. Metadata syncs separately with
            last-write-wins on a strictly increasing edit clock; content syncs as CRDT updates. Each account on a device has its own databases.
          </p>
        </Section>

        <Section id="multiplayer" title="Durable-first multiplayer">
          <ArchitectureDiagram />
          <p>
            Clients never relay document content to each other. They <strong>append</strong> a Yjs update to <Code>doc_updates</Code>; an <Code>AFTER INSERT</Code>{' '}
            trigger calls <Code>realtime.publish</Code> for the page’s channel. So anything a collaborator receives is already durable — there is no window where two
            screens agree on text the server doesn’t have.
          </p>
          <p>
            Clients only publish <strong>awareness</strong> (cursors and names), and row-level security on the realtime tables enforces that. Large updates are
            announced by id and fetched, and a missed message shows up as “pending structs” in Yjs, which triggers a resync from storage.
          </p>
        </Section>

        <Section id="offline" title="Offline and reconnects">
          <ReconcileDiagram />
          <p>
            Because every step is idempotent — applying a Yjs update twice is harmless — the same resync path handles first load, reconnects, dropped messages and
            pages edited before an account ever touched the server.
          </p>
        </Section>

        <Section id="compaction" title="Keeping history small">
          <p>
            An edge function folds a page’s update log into a snapshot with <Code>Y.mergeUpdates</Code>. It deletes <strong>exactly the ids it merged</strong> (never a
            range, so an update that commits late is never lost), and the write is guarded by a version number so two compactions can’t overwrite each other.
          </p>
        </Section>

        <Section id="security" title="Security model">
          <p>
            Every table has row-level security. Role checks read a private <Code>workspace_access</Code> mirror (each user sees only their own rows, maintained by a
            trigger), which lets policies on the member directory use the same helpers without recursing through RLS. Helpers run with the caller’s privileges — the
            database advisor reports zero critical findings.
          </p>
          <p>
            Invites are single-use, email-bound and expire in seven days; only the token’s SHA-256 is stored. Guest workspaces are ordinary accounts; saving one
            redeems a single-use claim in one SQL transaction, run by an edge function with admin rights that users can’t call directly.
          </p>
        </Section>

        <Section id="testing" title="How it’s tested">
          <p>
            The sync engine is tested against an <strong>in-memory server with failure injection</strong> — dropped broadcasts, offline clients, id-only
            announcements, latency, compaction races. The same fake server powers the demo on the home page.
          </p>
          <p>
            Separate scripts run against the <strong>live backend</strong> with real accounts: {STATS.liveChecks} checks for access control, invites, guests,
            compaction and telemetry. End-to-end browser tests drive real flows in isolated browser contexts, including two different users editing one page and a
            device going offline, and every push runs the suite in CI.
          </p>
        </Section>

        <Section id="bugs" title="Bugs the tests caught">
          <ul className="space-y-4">
            {BUGS.map(([title, body]) => (
              <li key={title}>
                <p className="font-medium text-ink">{title}</p>
                <p className="mt-1">{body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="stack" title="Stack">
          <p>React 19, TypeScript, Vite, TanStack Router, TipTap, Yjs, Dexie, Tailwind CSS, Vitest, Playwright — with InsForge for auth, Postgres, realtime, edge
            functions and schedules, and Vercel for hosting.</p>
        </Section>

        <div className="mt-16 flex flex-wrap gap-3">
          <Link to="/" className="rounded-md bg-lapis px-5 py-3 text-[15px] font-medium text-plaster hover:opacity-90">
            Try the live demo
          </Link>
          <a href="https://github.com/codewithsupra/tessera" className="rounded-md border border-line px-5 py-3 text-[15px] font-medium hover:bg-surface">
            Read the source
          </a>
        </div>
      </main>
    </div>
  )
}
