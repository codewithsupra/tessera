import { Link } from '@tanstack/react-router'
import { Logo } from '../components/Logo'

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

export function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/signin" className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">
            Sign in
          </Link>
          <Link to="/signup" className="rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-plaster hover:opacity-90">
            Start writing
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <section>
          <h1 className="font-display text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[1.02] tracking-[-0.02em] text-ink">
            Your notes stay yours. Your team still writes with you.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-soft">
            Tessera opens instantly and keeps working offline, because every page lives on your device first. Invite
            people to a workspace and edit the same page together, live. Export everything as plain Markdown whenever
            you want.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="rounded-md bg-lapis px-5 py-3 text-[15px] font-medium text-plaster hover:opacity-90">
              Start writing, free
            </Link>
            <Link to="/signin" className="rounded-md border border-line px-5 py-3 text-[15px] font-medium text-ink hover:bg-surface">
              Sign in
            </Link>
          </div>
          <ul className="mt-10 grid max-w-[34rem] gap-3 text-[15px] text-ink-soft sm:grid-cols-3">
            <li><span className="block font-semibold text-ink">Works offline</span>Edits sync when you reconnect.</li>
            <li><span className="block font-semibold text-ink">Live together</span>Cursors, presence, no conflicts.</li>
            <li><span className="block font-semibold text-ink">Plain Markdown</span>Leave any time with your files.</li>
          </ul>
        </section>
        <div className="flex justify-center lg:justify-end">
          <Mosaic />
        </div>
      </main>
    </div>
  )
}
