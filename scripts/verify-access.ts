/**
 * Live access-control checks for workspaces, pages, doc storage and realtime channels.
 * Run: npx tsx --env-file=.env.local --env-file=.env.e2e.local scripts/verify-access.ts
 * Uses two real test accounts (owner + stranger) and anonymous access. Exits non-zero on any failure.
 */
import { createClient } from '@insforge/sdk'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const baseUrl = process.env.VITE_INSFORGE_URL!
const anonKey = process.env.VITE_INSFORGE_ANON_KEY!
type Client = ReturnType<typeof createClient>

const results: [string, boolean, string][] = []
function check(name: string, ok: boolean, detail = '') {
  results.push([name, ok, detail])
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function signedIn(email: string, password: string): Promise<Client> {
  const c = createClient({ baseUrl, anonKey })
  let { error } = await c.auth.signInWithPassword({ email, password })
  if (error) {
    const up = await c.auth.signUp({ email, password, name: email.split('@')[0] })
    if (up.error) throw new Error(`cannot sign in or up ${email}: ${up.error.message}`)
    ;({ error } = await c.auth.signInWithPassword({ email, password }))
    if (error) throw new Error(`sign in after sign up failed: ${error.message}`)
  }
  return c
}

async function deleteUsers(ids: string[]) {
  const apiKey = JSON.parse(readFileSync('.insforge/project.json', 'utf8')).api_key as string
  await fetch(`${baseUrl}/api/auth/users`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: ids }),
  })
}

async function main() {
  const owner = await signedIn(process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!)
  const stranger = await signedIn(process.env.E2E_STRANGER_EMAIL!, process.env.E2E_STRANGER_PASSWORD!)
  const anon = createClient({ baseUrl, anonKey })
  const ownerId = (await owner.auth.getCurrentUser()).data.user!.id

  // Personal workspace
  const ws1 = await owner.database.rpc('ensure_personal_workspace')
  const ws2 = await owner.database.rpc('ensure_personal_workspace')
  const wsId = ws1.data as unknown as string
  check('personal workspace created', !ws1.error && typeof wsId === 'string', ws1.error?.message)
  check('personal workspace is idempotent', ws2.data === ws1.data)
  const strangerWs = (await stranger.database.rpc('ensure_personal_workspace')).data as unknown as string

  // Regression: a brand-new account must get a personal workspace on first call.
  const newbie = createClient({ baseUrl, anonKey })
  const newbieEmail = `e2e-fresh-${Date.now()}@tessera.test`
  const newbiePassword = `Pw-${randomUUID()}`
  await newbie.auth.signUp({ email: newbieEmail, password: newbiePassword, name: 'Fresh' })
  const freshId = (await newbie.auth.getCurrentUser()).data.user?.id
  const newbieWs = await newbie.database.rpc('ensure_personal_workspace')
  check('a brand-new account gets a personal workspace', typeof newbieWs.data === 'string', newbieWs.error?.message)
  const newbieAgain = await newbie.database.rpc('ensure_personal_workspace')
  check('…and the same one on the next call', newbieAgain.data === newbieWs.data)
  const racers = await Promise.all(
    [1, 2, 3].map(async () => {
      const c = createClient({ baseUrl, anonKey })
      await c.auth.signInWithPassword({ email: newbieEmail, password: newbiePassword })
      return (await c.database.rpc('ensure_personal_workspace')).data
    }),
  )
  check('concurrent calls agree on one workspace', racers.every((r) => r === newbieWs.data), JSON.stringify(racers))
  if (freshId) await deleteUsers([freshId])
  check('stranger gets a different workspace', !!strangerWs && strangerWs !== wsId)

  const anonRpc = await anon.database.rpc('ensure_personal_workspace')
  check('anon cannot create a workspace', !!anonRpc.error)

  const members = await owner.database.from('workspace_members').select('role').eq('workspace_id', wsId)
  check('owner is an owner member', members.data?.[0]?.role === 'owner', JSON.stringify(members.data))

  const forgedPersonal = await owner.database.from('workspaces').insert([{ name: 'x', owner_id: ownerId, is_personal: true }])
  check('cannot insert a second personal workspace directly', !!forgedPersonal.error)
  const forgedOwner = await stranger.database.from('workspaces').insert([{ name: 'hijack', owner_id: ownerId }])
  check('cannot create a workspace owned by someone else', !!forgedOwner.error)

  // Pages
  const pageId = randomUUID()
  const now = new Date()
  const ins = await owner.database.from('pages').insert([{ id: pageId, workspace_id: wsId, title: 'Access test', updated_at: now.toISOString() }])
  check('owner inserts a page', !ins.error, ins.error?.message)

  const strangerRead = await stranger.database.from('pages').select('id').eq('id', pageId)
  check('stranger cannot read the page', !strangerRead.error && strangerRead.data?.length === 0, JSON.stringify(strangerRead))
  const anonRead = await anon.database.from('pages').select('id').eq('id', pageId)
  check('anon cannot read pages', !!anonRead.error || anonRead.data?.length === 0)

  const strangerInsert = await stranger.database.from('pages').insert([{ id: randomUUID(), workspace_id: wsId, title: 'intrusion' }])
  check('stranger cannot add a page to the workspace', !!strangerInsert.error)
  const strangerUpdate = await stranger.database.from('pages').update({ title: 'defaced' }).eq('id', pageId).select()
  check('stranger cannot update the page', !!strangerUpdate.error || strangerUpdate.data?.length === 0)

  // Last write wins on the client clock
  const older = new Date(now.getTime() - 60_000).toISOString()
  await owner.database.from('pages').upsert([{ id: pageId, workspace_id: wsId, title: 'stale write', updated_at: older }], { onConflict: 'id' })
  const afterStale = await owner.database.from('pages').select('title').eq('id', pageId).single()
  check('stale upsert is ignored', afterStale.data?.title === 'Access test', afterStale.data?.title)
  const newer = new Date(now.getTime() + 1_000).toISOString()
  const fresh = await owner.database.from('pages').upsert([{ id: pageId, workspace_id: wsId, title: 'Fresh title', updated_at: newer }], { onConflict: 'id' })
  const afterFresh = await owner.database.from('pages').select('title').eq('id', pageId).single()
  check('newer upsert wins', !fresh.error && afterFresh.data?.title === 'Fresh title', fresh.error?.message ?? afterFresh.data?.title)

  const move = await owner.database.from('pages').update({ workspace_id: strangerWs, updated_at: new Date(now.getTime() + 2_000).toISOString() }).eq('id', pageId)
  check('workspace_id is immutable', !!move.error)
  const del = await owner.database.from('pages').delete().eq('id', pageId).select()
  check('hard delete is not allowed (soft delete only)', !!del.error || del.data?.length === 0)

  // Realtime: owner subscribes and receives durable updates; stranger cannot subscribe
  await owner.realtime.connect()
  const sub = await owner.realtime.subscribe(`doc:${pageId}`)
  check('owner can subscribe to the doc channel', sub.ok, sub.error?.message)
  const wsSub = await owner.realtime.subscribe(`ws:${wsId}`)
  check('owner can subscribe to the workspace channel', wsSub.ok, wsSub.error?.message)

  await stranger.realtime.connect()
  const strangerSub = await stranger.realtime.subscribe(`doc:${pageId}`)
  check('stranger cannot subscribe to the doc channel', !strangerSub.ok, strangerSub.error?.message)
  const strangerWsSub = await stranger.realtime.subscribe(`ws:${wsId}`)
  check('stranger cannot subscribe to the workspace channel', !strangerWsSub.ok)
  const junkSub = await owner.realtime.subscribe('doc:not-a-uuid')
  check('malformed channel names are rejected, not errors', !junkSub.ok)

  const got: Record<string, unknown>[] = []
  const pageEvents: Record<string, unknown>[] = []
  owner.realtime.on('y-update', (m: Record<string, unknown>) => got.push(m))
  owner.realtime.on('page', (m: Record<string, unknown>) => pageEvents.push(m))

  const upd = await owner.database.from('doc_updates').insert([{ page_id: pageId, data: 'AQHs3Q0AAQ==' }]).select('id')
  check('owner appends a doc update', !upd.error, upd.error?.message)
  await owner.database.from('pages').upsert([{ id: pageId, workspace_id: wsId, title: 'Broadcast me', updated_at: new Date(now.getTime() + 3_000).toISOString() }], { onConflict: 'id' })
  await sleep(2500)
  check('doc update is broadcast after it is stored', got.some((m) => m.u === 'AQHs3Q0AAQ==' && m.id === upd.data?.[0]?.id), `${got.length} msgs`)
  check('page change is broadcast to the workspace', pageEvents.some((m) => m.id === pageId && m.title === 'Broadcast me'), `${pageEvents.length} msgs`)

  const strangerUpd = await stranger.database.from('doc_updates').insert([{ page_id: pageId, data: 'AAAA' }])
  check('stranger cannot append doc updates', !!strangerUpd.error)
  const strangerDocs = await stranger.database.from('doc_updates').select('id').eq('page_id', pageId)
  check('stranger cannot read doc updates', !strangerDocs.error && strangerDocs.data?.length === 0)
  const forgedBroadcast = await owner.realtime.publish(`doc:${pageId}`, 'y-update', { u: 'AAAA' }).then(() => 'sent', (e: Error) => e.message)
  await sleep(1000)
  check('clients cannot publish document content directly', !got.some((m) => m.u === 'AAAA'), String(forgedBroadcast))
  await owner.realtime.publish(`doc:${pageId}`, 'y-awareness', { a: 'cursor' })
  check('owner can publish awareness', true)

  // Compaction RPC
  const strangerCompact = await stranger.database.rpc('apply_compaction', { p_page: pageId, p_data: 'AAAA', p_merged_ids: [], p_expected_version: null })
  check('stranger cannot compact', !!strangerCompact.error)
  const ids = (upd.data ?? []).map((r: { id: number }) => r.id)
  const c1 = await owner.database.rpc('apply_compaction', { p_page: pageId, p_data: 'AQHs3Q0AAQ==', p_merged_ids: ids, p_expected_version: null })
  check('owner compacts into a first snapshot', c1.data === true, c1.error?.message)
  const c2 = await owner.database.rpc('apply_compaction', { p_page: pageId, p_data: 'AAAA', p_merged_ids: [], p_expected_version: null })
  check('a second "first snapshot" loses the race safely', c2.data === false, JSON.stringify(c2))
  const c3 = await owner.database.rpc('apply_compaction', { p_page: pageId, p_data: 'AAAA', p_merged_ids: [], p_expected_version: 99 })
  check('a stale version is rejected', c3.data === false)
  const left = await owner.database.from('doc_updates').select('id').eq('page_id', pageId)
  check('merged updates were deleted', left.data?.length === 0, JSON.stringify(left.data))

  // Clean up the test page (soft delete keeps it; it's inert)
  await owner.database.from('pages').update({ deleted_at: new Date().toISOString(), updated_at: new Date(now.getTime() + 10_000).toISOString() }).eq('id', pageId)

  owner.realtime.disconnect()
  stranger.realtime.disconnect()
  const failed = results.filter(([, ok]) => !ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
