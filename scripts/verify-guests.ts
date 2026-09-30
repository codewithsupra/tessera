/**
 * Live checks for guest workspaces: claims, "Save my workspace", the janitor, onboarding claims.
 * Run: npm run verify:guests
 */
import { createClient } from '@insforge/sdk'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const baseUrl = process.env.VITE_INSFORGE_URL!
const anonKey = process.env.VITE_INSFORGE_ANON_KEY!
const apiKey = JSON.parse(readFileSync('.insforge/project.json', 'utf8')).api_key as string
const janitorKey = process.env.JANITOR_SECRET!
type Client = ReturnType<typeof createClient>

let failed = 0
let total = 0
const check = (name: string, ok: boolean, detail = '') => {
  total++
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sql = (q: string) => execFileSync('npx', ['-y', '@insforge/cli', 'db', 'query', q], { stdio: 'pipe' }).toString()
const token = () => randomBytes(32).toString('base64url')
const sha = (t: string) => createHash('sha256').update(t).digest('hex')
const cleanup: string[] = []

async function account(email: string) {
  const password = `Pw-${randomBytes(9).toString('hex')}`
  const c = createClient({ baseUrl, anonKey })
  const up = await c.auth.signUp({ email, password, name: email.startsWith('guest-') ? 'Guest' : 'Saver' })
  if (up.error) throw new Error(`${email}: ${up.error.message}`)
  const id = (await c.auth.getCurrentUser()).data.user!.id
  cleanup.push(id)
  return { c, id, email, password }
}
const guest = () => account(`guest-${randomUUID()}@guest.tessera-notes.app`)
const real = () => account(`e2e-saver-${randomBytes(4).toString('hex')}@tessera.test`)

async function claimVia(c: Client, t: string) {
  const r = await c.functions.invoke('claim-guest', { body: { token: t } })
  const err = r.error as { message?: string; error?: string } | null
  return { ok: !r.error && (r.data as { ok?: boolean })?.ok === true, error: err?.error || err?.message || (r.data as { error?: string })?.error, data: r.data }
}

async function janitor(headers: Record<string, string>, body: object = {}) {
  const res = await fetch('https://' + new URL(baseUrl).hostname.split('.')[0] + '.function2.insforge.app/guest-janitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as { deleted?: number } }
}

async function main() {
  // --- A guest with content ---
  const g = await guest()
  const ws = (await g.c.database.rpc('ensure_personal_workspace')).data as unknown as string
  const pageId = randomUUID()
  await g.c.database.from('pages').insert([{ id: pageId, workspace_id: ws, title: 'Guest notes' }])
  await g.c.database.from('doc_updates').insert([{ page_id: pageId, data: 'AAA=' }])
  check('guest accounts can be created with the reserved email shape', !!ws)

  // --- Claims ---
  const saver = await real()
  const notGuestClaim = await saver.c.database.from('guest_claims').insert([{ token_hash: sha(token()) }])
  check('real accounts cannot create claims', !!notGuestClaim.error)
  const t = token()
  const claim = await g.c.database.from('guest_claims').insert([{ token_hash: sha(t) }])
  check('a guest creates a claim', !claim.error, claim.error?.message)
  const peek = await saver.c.database.from('guest_claims').select('id')
  check('claims are private to the guest', peek.data?.length === 0)

  const wrong = await claimVia(saver.c, token())
  check('a made-up claim token is rejected', !wrong.ok, wrong.error)
  const anon = createClient({ baseUrl, anonKey })
  const anonTry = await claimVia(anon, t)
  check('claiming requires being signed in', !anonTry.ok)
  const direct = await saver.c.database.rpc('transfer_guest', { p_token_hash: sha(t), p_new_user: saver.id })
  check('the transfer cannot be called directly by users', !!direct.error)

  const ok = await claimVia(saver.c, t)
  check('the new account saves the guest workspace', ok.ok, JSON.stringify(ok.data ?? ok.error))
  const pages = await saver.c.database.from('pages').select('title, workspace_id').eq('id', pageId)
  check('the guest’s pages now belong to the new account', pages.data?.[0]?.title === 'Guest notes')
  const personal = await saver.c.database.from('workspaces').select('id, is_personal, owner_id').eq('id', ws).single()
  check('it became their personal workspace', personal.data?.is_personal === true && personal.data?.owner_id === saver.id)
  const guestLogin = await createClient({ baseUrl, anonKey }).auth.signInWithPassword({ email: g.email, password: g.password })
  check('the guest account is deleted afterwards', !!guestLogin.error)
  const reuse = await claimVia(saver.c, t)
  check('a claim cannot be used twice', !reuse.ok)

  // --- Saving a second guest into an account that already has a personal workspace ---
  const g2 = await guest()
  const ws2 = (await g2.c.database.rpc('ensure_personal_workspace')).data as unknown as string
  const t2 = token()
  await g2.c.database.from('guest_claims').insert([{ token_hash: sha(t2) }])
  const second = await claimVia(saver.c, t2)
  const kept = await saver.c.database.from('workspaces').select('name, is_personal').eq('id', ws2).single()
  check('a second guest workspace is kept as a team workspace', second.ok && kept.data?.is_personal === false && kept.data?.name === 'Guest workspace', JSON.stringify(kept.data))

  // --- Guests cannot absorb guests; expired claims fail ---
  const g3 = await guest()
  const g4 = await guest()
  const t3 = token()
  await g3.c.database.from('guest_claims').insert([{ token_hash: sha(t3) }])
  const guestIntoGuest = await claimVia(g4.c, t3)
  check('a guest cannot save into another guest', !guestIntoGuest.ok, guestIntoGuest.error)
  sql(`update guest_claims set expires_at = now() - interval '1 minute' where token_hash = '${sha(t3)}'`)
  const saver2 = await real()
  const expired = await claimVia(saver2.c, t3)
  check('expired claims are rejected', !expired.ok && /expired/i.test(expired.error ?? ''), expired.error)

  // --- Onboarding claim ---
  const o1 = await saver2.c.database.rpc('ensure_personal_workspace')
  const first = await saver2.c.database.rpc('claim_onboarding', { p_workspace: o1.data })
  const again = await saver2.c.database.rpc('claim_onboarding', { p_workspace: o1.data })
  const stranger = await saver.c.database.rpc('claim_onboarding', { p_workspace: o1.data })
  check('onboarding is claimed exactly once, by the owner', first.data === true && again.data === false && stranger.data === false, JSON.stringify([first.data, again.data, stranger.data]))

  // --- Janitor ---
  const noKey = await janitor({})
  const badKey = await janitor({ 'x-janitor-key': 'nope' })
  check('the janitor refuses callers without the secret', noKey.status === 403 && badKey.status === 403)
  const old = await guest()
  const fresh = await guest()
  sql(`update auth.users set created_at = now() - interval '8 days' where id = '${old.id}'`)
  const run = await janitor({ 'x-janitor-key': janitorKey })
  const oldGone = await createClient({ baseUrl, anonKey }).auth.signInWithPassword({ email: old.email, password: old.password })
  const freshAlive = await createClient({ baseUrl, anonKey }).auth.signInWithPassword({ email: fresh.email, password: fresh.password })
  check('the janitor deletes guests older than 7 days', run.status === 200 && (run.body.deleted ?? 0) >= 1 && !!oldGone.error, JSON.stringify(run.body))
  check('…and keeps recent guests', !freshAlive.error)
  const realAlive = await createClient({ baseUrl, anonKey }).auth.signInWithPassword({ email: saver.email, password: saver.password })
  check('…and never touches real accounts', !realAlive.error)

  // --- Cleanup ---
  await fetch(`${baseUrl}/api/auth/users`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: cleanup }),
  })
  console.log(`\n${total - failed}/${total} passed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => {
  console.error(e)
  process.exit(2)
})
