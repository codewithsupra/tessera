/**
 * Live checks for first-party telemetry (app_events, client_errors, app_admins).
 * Run: npm run verify:telemetry
 * Temporarily allow-lists the E2E owner as an admin (via the CLI, as project admin) and removes it after.
 */
import { createClient } from '@insforge/sdk'
import { execFileSync } from 'node:child_process'

const baseUrl = process.env.VITE_INSFORGE_URL!
const anonKey = process.env.VITE_INSFORGE_ANON_KEY!
let failed = 0
let total = 0
const check = (name: string, ok: boolean, detail = '') => {
  total++
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q: string) => execFileSync('npx', ['-y', '@insforge/cli', 'db', 'query', q], { stdio: 'pipe' }).toString()

async function signIn(email: string, password: string) {
  const c = createClient({ baseUrl, anonKey })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return c
}

async function main() {
  const anon = createClient({ baseUrl, anonKey })
  const owner = await signIn(process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!)
  const other = await signIn(process.env.E2E_STRANGER_EMAIL!, process.env.E2E_STRANGER_PASSWORD!)
  const ownerId = (await owner.auth.getCurrentUser()).data.user!.id
  const marker = `verify-${Date.now()}`

  // Events
  const a1 = await anon.database.from('app_events').insert([{ name: 'landing_viewed', props: { marker } }])
  check('anonymous visitors can record landing events', !a1.error, a1.error?.message)
  const a2 = await anon.database.from('app_events').insert([{ name: 'signed_up', props: {} }])
  check('anonymous visitors cannot record account events', !!a2.error)
  const u1 = await owner.database.from('app_events').insert([{ name: 'page_created', props: { marker } }])
  check('signed-in users record events', !u1.error, u1.error?.message)
  const forged = await owner.database.from('app_events').insert([{ name: 'page_created', user_id: '00000000-0000-0000-0000-000000000000' }])
  check('events cannot be attributed to someone else', !!forged.error)
  const unknown = await owner.database.from('app_events').insert([{ name: 'totally_made_up' }])
  check('unknown event names are rejected', !!unknown.error)
  const huge = await owner.database.from('app_events').insert([{ name: 'page_created', props: { blob: 'x'.repeat(5000) } }])
  check('oversized event payloads are rejected', !!huge.error)
  const peek = await other.database.from('app_events').select('id').limit(5)
  check('non-admins cannot read analytics', !peek.error && peek.data?.length === 0, JSON.stringify(peek.data))
  const anonPeek = await anon.database.from('app_events').select('id').limit(1)
  check('anonymous visitors cannot read analytics', !!anonPeek.error || anonPeek.data?.length === 0)

  // Errors
  const e1 = await anon.database.from('client_errors').insert([{ message: `${marker} boom`, stack: 'at x', url: '/', user_agent: 'verify' }])
  check('anyone can report a client error', !e1.error, e1.error?.message)
  const e2 = await owner.database.from('client_errors').insert([{ message: 'x'.repeat(1001) }])
  check('error reports are length-capped', !!e2.error)
  const e3 = await other.database.from('client_errors').select('id').limit(1)
  check('non-admins cannot read error reports', !e3.error && e3.data?.length === 0)

  // Admin read (temporarily allow-list the owner)
  const ownerEmail = process.env.E2E_EMAIL!.toLowerCase()
  sql(`insert into app_admins(email) values ('${ownerEmail}') on conflict do nothing`)
  try {
    const admin = await owner.database.from('app_events').select('name, user_id, props').eq('props->>marker', marker)
    const mine = admin.data?.find((r) => r.name === 'page_created')
    check('admins can read analytics', (admin.data?.length ?? 0) >= 2, admin.error?.message)
    check('events are stamped with the real user', mine?.user_id === ownerId)
    const anonRow = admin.data?.find((r) => r.name === 'landing_viewed')
    check('anonymous events carry no user', !!anonRow && anonRow.user_id === null)
    const errs = await owner.database.from('client_errors').select('message').like('message', `${marker}%`)
    check('admins can read error reports', errs.data?.length === 1, errs.error?.message)
    const isAdmin = await owner.database.rpc('is_app_admin')
    const notAdmin = await other.database.rpc('is_app_admin')
    check('is_app_admin() reflects the allow-list', isAdmin.data === true && notAdmin.data === false)
    const adminList = await other.database.from('app_admins').select('email')
    check('the admin list is private', adminList.data?.length === 0)
  } finally {
    sql(`delete from app_admins where email = '${ownerEmail}'`)
    sql(`delete from app_events where props->>'marker' = '${marker}'`)
    sql(`delete from client_errors where message like '${marker}%'`)
  }

  console.log(`\n${total - failed}/${total} passed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => {
  console.error(e)
  process.exit(2)
})
