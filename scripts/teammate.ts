/**
 * Plays a second person: accepts an invite link, joins a page with presence, writes a paragraph.
 * Run: npx tsx --env-file=.env.local --env-file=.env.e2e.local scripts/teammate.ts <inviteUrlOrToken> <pageId> [seconds]
 * Uses the E2E_STRANGER account.
 */
import { createClient } from '@insforge/sdk'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as Y from 'yjs'

const [link, pageId, secs = '20'] = process.argv.slice(2)
if (!link || !pageId) throw new Error('usage: teammate.ts <inviteUrlOrToken> <pageId> [seconds]')
const token = link.split('/invite/').pop()!
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function main() {
  const c = createClient({ baseUrl: process.env.VITE_INSFORGE_URL!, anonKey: process.env.VITE_INSFORGE_ANON_KEY! })
  const { error } = await c.auth.signInWithPassword({ email: process.env.E2E_STRANGER_EMAIL!, password: process.env.E2E_STRANGER_PASSWORD! })
  if (error) throw new Error(error.message)
  const me = (await c.auth.getCurrentUser()).data.user!

  const joined = await c.database.rpc('accept_invite', { p_token: token })
  log('accept_invite ->', joined.error?.message ?? joined.data)

  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)
  const channel = `doc:${pageId}`
  await c.realtime.connect()
  const sub = await c.realtime.subscribe(channel)
  log('subscribe ->', sub.ok ? 'ok' : sub.error?.message)
  const mine = (m: { meta?: { channel?: string } }) => m.meta?.channel === channel || m.meta?.channel === `realtime:${channel}`
  c.realtime.on('y-update', (m: { meta?: { channel?: string }; u: string }) => mine(m) && Y.applyUpdate(doc, unb64(m.u), 'remote'))
  c.realtime.on('y-awareness', (m: { meta?: { channel?: string }; a: string }) => mine(m) && awarenessProtocol.applyAwarenessUpdate(awareness, unb64(m.a), 'remote'))

  const snap = await c.database.from('doc_snapshots').select('data').eq('page_id', pageId).maybeSingle()
  if (snap.data) Y.applyUpdate(doc, unb64(snap.data.data), 'remote')
  const ups = await c.database.from('doc_updates').select('data').eq('page_id', pageId).order('id')
  for (const u of ups.data ?? []) Y.applyUpdate(doc, unb64(u.data), 'remote')
  log('loaded', ups.data?.length ?? 0, 'updates; title =', JSON.stringify(doc.getText('title').toString()))

  const announce = () => {
    const update = awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID])
    void c.realtime.publish(channel, 'y-awareness', { a: b64(update) })
  }
  awareness.setLocalState({ user: { name: 'Sam Rivera', color: '#C2410C', id: me.id } })
  announce()
  const beat = setInterval(announce, 5000)

  const sv = Y.encodeStateVector(doc)
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(process.env.MSG ?? 'Sam here — I can edit this page.')])
  doc.getXmlFragment('content').push([p])
  const w = await c.database.from('doc_updates').insert([{ page_id: pageId, data: b64(Y.encodeStateAsUpdate(doc, sv)) }])
  log('write ->', w.error ? `refused: ${w.error.message}` : 'stored')

  await new Promise((r) => setTimeout(r, Number(secs) * 1000))
  clearInterval(beat)
  awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], 'leave')
  const bye = awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID])
  await c.realtime.publish(channel, 'y-awareness', { a: b64(bye) })
  log('left')
  c.realtime.disconnect()
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
