/**
 * Live checks for team workspaces: invites, roles, member directory, leaving, deletion.
 * Run: npm run verify:teams
 */
import { createClient } from '@insforge/sdk'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const baseUrl = process.env.VITE_INSFORGE_URL!
const anonKey = process.env.VITE_INSFORGE_ANON_KEY!
type Client = ReturnType<typeof createClient>

let failed = 0
let total = 0
function check(name: string, ok: boolean, detail = '') {
  total++
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const newToken = () => randomBytes(32).toString('base64url')
const hashOf = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')

async function signedIn(email: string, password: string): Promise<Client> {
  const c = createClient({ baseUrl, anonKey })
  let { error } = await c.auth.signInWithPassword({ email, password })
  if (error) {
    const up = await c.auth.signUp({ email, password, name: email.split('@')[0] })
    if (up.error) throw new Error(`cannot create ${email}: ${up.error.message}`)
    ;({ error } = await c.auth.signInWithPassword({ email, password }))
    if (error) throw new Error(error.message)
  }
  return c
}

async function main() {
  const env = process.env
  const owner = await signedIn(env.E2E_EMAIL!, env.E2E_PASSWORD!)
  const invitee = await signedIn(env.E2E_STRANGER_EMAIL!, env.E2E_STRANGER_PASSWORD!)
  const outsider = await signedIn(env.E2E_OUTSIDER_EMAIL!, env.E2E_OUTSIDER_PASSWORD!)
  const ownerId = (await owner.auth.getCurrentUser()).data.user!.id
  const inviteeId = (await invitee.auth.getCurrentUser()).data.user!.id
  const inviteeEmail = env.E2E_STRANGER_EMAIL!.toLowerCase()

  // --- Team workspace ---
  const personal = (await owner.database.rpc('ensure_personal_workspace')).data as unknown as string
  const created = await owner.database.rpc('create_workspace', { p_name: 'Verify team' })
  const ws = created.data as unknown as string
  check('owner creates a team workspace', !created.error && !!ws, created.error?.message)
  const blank = await owner.database.rpc('create_workspace', { p_name: '   ' })
  check('workspace names are validated', !!blank.error)
  const forgedWs = await owner.database.from('workspaces').insert([{ name: 'x', owner_id: inviteeId }])
  check('cannot create a workspace owned by someone else', !!forgedWs.error)
  const ownerRow = await owner.database.from('workspace_members').select('role, email').eq('workspace_id', ws).eq('user_id', ownerId).single()
  check('owner is listed as owner with their email', ownerRow.data?.role === 'owner' && ownerRow.data?.email === env.E2E_EMAIL!.toLowerCase(), JSON.stringify(ownerRow.data))

  // --- Creating invites ---
  const personalInvite = await owner.database.from('workspace_invites').insert([{ workspace_id: personal, email: inviteeEmail, role: 'editor', token_hash: hashOf(newToken()) }])
  check('personal workspaces cannot be shared', !!personalInvite.error)
  const forged = await invitee.database.from('workspace_invites').insert([{ workspace_id: ws, email: inviteeEmail, role: 'editor', token_hash: hashOf(newToken()) }])
  check('non-members cannot create invites', !!forged.error)
  const badRole = await owner.database.from('workspace_invites').insert([{ workspace_id: ws, email: inviteeEmail, role: 'owner', token_hash: hashOf(newToken()) }])
  check('invites cannot grant ownership', !!badRole.error)

  const token = newToken()
  const inv = await owner.database.from('workspace_invites').insert([{ workspace_id: ws, email: inviteeEmail, role: 'editor', token_hash: hashOf(token) }]).select('id, expires_at, invited_by').single()
  check('owner invites by email', !inv.error, inv.error?.message)
  check('server sets inviter and a 7-day expiry', inv.data?.invited_by === ownerId && Date.parse(inv.data?.expires_at ?? '') > Date.now() + 6.9 * 864e5)

  const seenByInvitee = await invitee.database.from('workspace_invites').select('id').eq('workspace_id', ws)
  check('invitee can see the invite addressed to them', seenByInvitee.data?.length === 1)
  const seenByOutsider = await outsider.database.from('workspace_invites').select('id').eq('workspace_id', ws)
  check('others cannot see it', seenByOutsider.data?.length === 0)

  // --- Joining ---
  const sneak = await invitee.database.from('workspace_members').insert([{ workspace_id: ws, user_id: inviteeId, role: 'editor' }])
  check('cannot join without the token', !!sneak.error)
  const wrongHash = await invitee.database.from('workspace_members').insert([{ workspace_id: ws, user_id: inviteeId, role: 'editor', invite_hash: hashOf(newToken()) }])
  check('cannot join with a made-up token', !!wrongHash.error)
  const escalate = await invitee.database.from('workspace_members').insert([{ workspace_id: ws, user_id: inviteeId, role: 'owner', invite_hash: hashOf(token) }])
  check('cannot join with a higher role than invited', !!escalate.error)

  const stolen = await outsider.database.rpc('accept_invite', { p_token: token })
  check('someone else holding the link cannot use it', !!stolen.error, stolen.error?.message)

  const accepted = await invitee.database.rpc('accept_invite', { p_token: token })
  check('invitee accepts with the link', accepted.data === ws, accepted.error?.message)
  const again = await invitee.database.rpc('accept_invite', { p_token: token })
  check('accepting twice is harmless', again.data === ws, again.error?.message)
  const myRole = await invitee.database.from('workspace_members').select('role').eq('workspace_id', ws).eq('user_id', inviteeId).single()
  check('invitee joined as editor', myRole.data?.role === 'editor')

  // --- Directory ---
  const dir = await invitee.database.from('workspace_members').select('user_id, role, display_name, email').eq('workspace_id', ws)
  check('members see each other (name, email, role)', dir.data?.length === 2 && dir.data.some((m) => m.user_id === ownerId && m.email && m.display_name), JSON.stringify(dir.data?.map((m) => [m.role, m.email])))
  const outsiderDir = await outsider.database.from('workspace_members').select('user_id').eq('workspace_id', ws)
  check('outsiders see no members', outsiderDir.data?.length === 0)

  // --- Editing as editor ---
  const pageId = randomUUID()
  const ownerPage = await owner.database.from('pages').insert([{ id: pageId, workspace_id: ws, title: 'Team page' }])
  check('owner creates a team page', !ownerPage.error, ownerPage.error?.message)
  const editorRead = await invitee.database.from('pages').select('title').eq('id', pageId)
  check('editor reads team pages', editorRead.data?.[0]?.title === 'Team page')
  const editorUpd = await invitee.database.from('doc_updates').insert([{ page_id: pageId, data: 'AAA=' }])
  check('editor writes document content', !editorUpd.error, editorUpd.error?.message)
  await invitee.realtime.connect()
  const editorSub = await invitee.realtime.subscribe(`doc:${pageId}`)
  check('editor joins the live channel', editorSub.ok)

  const selfPromote = await invitee.database.from('workspace_members').update({ role: 'viewer' }).eq('workspace_id', ws).eq('user_id', ownerId).select()
  check('editors cannot change other members', !!selfPromote.error || selfPromote.data?.length === 0)

  // --- Downgrade to viewer ---
  const demote = await owner.database.from('workspace_members').update({ role: 'viewer' }).eq('workspace_id', ws).eq('user_id', inviteeId).select('role')
  check('owner changes a member to viewer', demote.data?.[0]?.role === 'viewer', demote.error?.message)
  const makeOwner = await owner.database.from('workspace_members').update({ role: 'owner' }).eq('workspace_id', ws).eq('user_id', inviteeId).select()
  check('ownership cannot be handed out by role edit', !!makeOwner.error || makeOwner.data?.length === 0)
  const viewerWrite = await invitee.database.from('doc_updates').insert([{ page_id: pageId, data: 'AAA=' }])
  check('viewer cannot write content', !!viewerWrite.error)
  const viewerPage = await invitee.database.from('pages').update({ title: 'x', updated_at: new Date(Date.now() + 5000).toISOString() }).eq('id', pageId).select()
  check('viewer cannot edit page metadata', !!viewerPage.error || viewerPage.data?.length === 0)
  const viewerRead = await invitee.database.from('doc_updates').select('id').eq('page_id', pageId)
  check('viewer still reads content', (viewerRead.data?.length ?? 0) > 0)

  // --- Revoked invite ---
  const t2 = newToken()
  const inv2 = await owner.database.from('workspace_invites').insert([{ workspace_id: ws, email: env.E2E_OUTSIDER_EMAIL!.toLowerCase(), role: 'viewer', token_hash: hashOf(t2) }]).select('id').single()
  await owner.database.from('workspace_invites').update({ revoked_at: new Date().toISOString() }).eq('id', inv2.data!.id)
  const revoked = await outsider.database.rpc('accept_invite', { p_token: t2 })
  check('withdrawn invites cannot be used', !!revoked.error && /withdrawn/i.test(revoked.error.message), revoked.error?.message)

  // --- Leaving & removal ---
  const ownerLeave = await owner.database.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', ownerId).select()
  check('the owner cannot leave their own workspace', !!ownerLeave.error || ownerLeave.data?.length === 0)
  const leave = await invitee.database.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', inviteeId).select()
  check('a member can leave', leave.data?.length === 1, leave.error?.message)
  const afterLeave = await invitee.database.from('pages').select('id').eq('id', pageId)
  check('after leaving, pages are no longer visible', afterLeave.data?.length === 0)

  // --- Deleting ---
  const delPersonal = await owner.database.from('workspaces').delete().eq('id', personal).select()
  check('personal workspaces cannot be deleted', !!delPersonal.error || delPersonal.data?.length === 0)
  const delTeam = await owner.database.from('workspaces').delete().eq('id', ws).select()
  check('owner deletes the team workspace', delTeam.data?.length === 1, delTeam.error?.message)
  const gone = await owner.database.from('pages').select('id').eq('id', pageId)
  check('its pages are gone with it', gone.data?.length === 0)

  invitee.realtime.disconnect()
  await sleep(100)
  console.log(`\n${total - failed}/${total} passed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
