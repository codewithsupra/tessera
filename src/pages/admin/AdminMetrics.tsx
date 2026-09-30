import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Logo } from '../../components/Logo'
import { insforge } from '../../lib/insforge'
import { NotFound } from '../NotFound'
import { DailyBars, DataTable, Funnel, Legend, type Point } from './charts'
import { pct } from './format'

export type Metrics = {
  days: number
  generated_at: string
  totals: Record<string, number>
  signups: { day: string; real: number; guest: number }[]
  dau: { day: string; users: number }[]
  pages_daily: { day: string; pages: number }[]
  funnel: Record<string, number>
  errors: { message: string; count: number; last_seen: string }[]
}

const SIGNUPS = [
  { key: 'real', label: 'Accounts', color: 'var(--viz-1)' },
  { key: 'guest', label: 'Guests', color: 'var(--viz-2)' },
]


function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-3xl text-ink tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
    </div>
  )
}

function Panel({ title, children, legend }: { title: string; children: React.ReactNode; legend?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-ink">{title}</h2>
        {legend}
      </div>
      {children}
    </section>
  )
}

export function AdminMetrics() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Metrics | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    void insforge.functions.invoke('admin-metrics', { body: { days } }).then(({ data, error }) => {
      if (cancelled) return
      const status = (error as { statusCode?: number } | null)?.statusCode
      if (status === 404 || status === 401) return setState('denied')
      if (error || !data) return setState('error')
      setData(data as Metrics)
      setState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [days])

  // Only name the page once access is confirmed, so the tab title doesn't reveal it exists.
  useEffect(() => {
    if (state !== 'ready') return
    document.title = 'Metrics · Tessera'
    return () => {
      document.title = 'Tessera'
    }
  }, [state])

  if (state === 'denied') return <NotFound />

  const t = data?.totals ?? {}
  const f = data?.funnel ?? {}

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/app" aria-label="Back to the app">
          <Logo />
        </Link>
        <div className="flex items-center gap-1 rounded-lg border border-line p-0.5 text-sm" role="group" aria-label="Time range">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => (setState('loading'), setDays(d))} aria-pressed={days === d} className={`rounded-md px-3 py-1 ${days === d ? 'bg-ink text-plaster' : 'text-ink-soft hover:text-ink'}`}>
              {d} days
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <h1 className="font-display text-3xl font-medium tracking-tight">Metrics</h1>
        <p className="mt-1 text-sm text-ink-faint">
          First-party, aggregate only. {data ? `Updated ${new Date(data.generated_at).toLocaleTimeString()}.` : ''}
        </p>

        {state === 'error' && <p role="alert" className="mt-6 text-danger">Metrics are unavailable right now. Try again in a minute.</p>}
        {state === 'loading' && !data && <p className="mt-6 text-ink-soft" aria-busy="true">Loading metrics…</p>}

        {data && (
          <div className={`mt-6 grid gap-5 ${state === 'loading' ? 'opacity-60' : ''}`}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Tile label="Accounts" value={t.users_real} sub={`${t.new_real} new in ${data.days} days`} />
              <Tile label="Activation" value={pct(t.activated, t.new_real)} sub="new accounts that wrote a page within 24h" />
              <Tile label="Guests saved" value={pct(f.guest_saved, f.guest_started)} sub={`${f.guest_saved} of ${f.guest_started} guests kept their workspace`} />
              <Tile label="Collaborative workspaces" value={t.collaborative_workspaces} sub={`of ${t.team_workspaces} team workspaces`} />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Sign-ups per day" legend={<Legend series={SIGNUPS} />}>
                <DailyBars data={data.signups as unknown as Point[]} series={SIGNUPS} label={`Sign-ups per day, accounts and guests, last ${data.days} days`} />
                <DataTable data={data.signups as unknown as Point[]} series={SIGNUPS} />
              </Panel>
              <Panel title="Daily active users">
                <DailyBars data={data.dau as unknown as Point[]} series={[{ key: 'users', label: 'Active users', color: 'var(--viz-1)' }]} label={`Daily active users, last ${data.days} days`} />
                <DataTable data={data.dau as unknown as Point[]} series={[{ key: 'users', label: 'Active users', color: 'var(--viz-1)' }]} />
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title={`Funnel, last ${data.days} days`}>
                <Funnel
                  steps={[
                    { label: 'Visited the site', value: f.landing_viewed },
                    { label: 'Tried the demo', value: f.demo_interacted },
                    { label: 'Started as guest', value: f.guest_started },
                    { label: 'Signed up', value: f.signed_up },
                    { label: 'Created a page', value: f.page_created },
                    { label: 'Invited someone', value: f.invite_created },
                    { label: 'Exported Markdown', value: f.export_downloaded },
                  ]}
                />
              </Panel>
              <Panel title="Pages created per day">
                <DailyBars data={data.pages_daily as unknown as Point[]} series={[{ key: 'pages', label: 'Pages', color: 'var(--viz-1)' }]} label={`Pages created per day, last ${data.days} days`} />
                <p className="mt-2 text-xs text-ink-faint">
                  {t.pages} pages in total · {t.doc_updates} edits synced · {t.invites_accepted} of {t.invites_sent} invites accepted
                </p>
              </Panel>
            </div>

            <Panel title={`Client errors, last 7 days (${t.errors_7d})`}>
              {data.errors.length === 0 ? (
                <p className="text-sm text-ink-soft">No errors reported. 🎉</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-ink-faint">
                    <tr>
                      <th className="py-1 font-medium">Message</th>
                      <th className="py-1 text-right font-medium">Count</th>
                      <th className="py-1 text-right font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.errors.map((e) => (
                      <tr key={e.message} className="border-t border-line">
                        <td className="max-w-0 truncate py-1.5 pr-3 text-ink">{e.message}</td>
                        <td className="py-1.5 text-right tabular-nums">{e.count}</td>
                        <td className="py-1.5 text-right text-ink-soft">{new Date(e.last_seen).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        )}
      </main>
    </div>
  )
}
