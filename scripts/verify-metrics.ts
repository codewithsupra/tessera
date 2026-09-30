/**
 * Live checks for the owner metrics endpoint: admins get aggregates, everyone else gets 404.
 * Run: npm run verify:metrics  (temporarily allow-lists the E2E owner, then removes it)
 */
import { createClient } from '@insforge/sdk'
import { sql } from './admin'

const baseUrl = process.env.VITE_INSFORGE_URL!
const anonKey = process.env.VITE_INSFORGE_ANON_KEY!
let failed = 0
let total = 0
const check = (name: string, ok: boolean, detail = '') => {
  total++
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
async function signIn(email: string, password: string) {
  const c = createClient({ baseUrl, anonKey })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return c
}
const status = (e: unknown) => (e as { statusCode?: number } | null)?.statusCode

async function main() {
  const owner = await signIn(process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!)
  const other = await signIn(process.env.E2E_STRANGER_EMAIL!, process.env.E2E_STRANGER_PASSWORD!)
  const anon = createClient({ baseUrl, anonKey })

  const a = await anon.functions.invoke('admin-metrics', { body: {} })
  check('signed-out callers get 404', status(a.error) === 404 || status(a.error) === 401, String(status(a.error)))
  const n = await other.functions.invoke('admin-metrics', { body: {} })
  check('non-admins get 404', status(n.error) === 404, String(status(n.error)))
  const direct = await owner.database.rpc('admin_metrics', { p_days: 7 })
  check('users cannot call the aggregate function directly', !!direct.error)

  const email = process.env.E2E_EMAIL!.toLowerCase()
  await sql(`insert into app_admins(email) values ('${email}') on conflict do nothing`)
  try {
    const r = await owner.functions.invoke('admin-metrics', { body: { days: 14 } })
    const d = r.data as { days: number; totals: Record<string, number>; signups: unknown[]; dau: unknown[]; funnel: Record<string, number>; errors: unknown[] } | null
    check('admins get metrics', !r.error && !!d, JSON.stringify(r.error))
    check('daily series cover the requested window', d?.days === 14 && d.signups.length === 14 && d.dau.length === 14)
    check('totals are numbers', !!d && ['users_real', 'users_guest', 'pages', 'invites_sent'].every((k) => typeof d.totals[k] === 'number'))
    check('the funnel counts first-party events', !!d && typeof d.funnel.landing_viewed === 'number')
    const clamped = await owner.functions.invoke('admin-metrics', { body: { days: 10000 } })
    check('the window is clamped to 180 days', (clamped.data as { days?: number })?.days === 180)
    const payload = JSON.stringify(d)
    check('no user emails in the payload', !/@tessera\.test|@guest\.tessera-notes\.app/.test(payload))
  } finally {
    await sql(`delete from app_admins where email = '${email}'`)
  }
  console.log(`\n${total - failed}/${total} passed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => {
  console.error(e)
  process.exit(2)
})
