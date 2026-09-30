/**
 * Acts as a second device for a live sync demo/test: joins a page, writes a paragraph,
 * then listens and prints what arrives from other devices.
 * Run: npx tsx --env-file=.env.local --env-file=.env.e2e.local scripts/remote-device.ts <pageId> [listenSeconds]
 */
import { createClient } from '@insforge/sdk'
import * as Y from 'yjs'

const [pageId, listen = '10'] = process.argv.slice(2)
if (!pageId) throw new Error('usage: remote-device.ts <pageId> [listenSeconds]')
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))

const plain = (frag: Y.XmlFragment): string =>
  frag
    .toArray()
    .map((n) => (n instanceof Y.XmlElement ? n.toArray().map((c) => (c instanceof Y.XmlText ? c.toString() : plain(c as Y.XmlFragment))).join('') : String(n)))
    .join(' | ')

async function main() {
  const c = createClient({ baseUrl: process.env.VITE_INSFORGE_URL!, anonKey: process.env.VITE_INSFORGE_ANON_KEY! })
  const { error } = await c.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! })
  if (error) throw new Error(error.message)

  const doc = new Y.Doc()
  const channel = `doc:${pageId}`
  await c.realtime.connect()
  const sub = await c.realtime.subscribe(channel)
  if (!sub.ok) throw new Error(`subscribe failed: ${sub.error?.message}`)
  const t0 = Date.now()
  c.realtime.on('y-update', (m: { meta: { channel: string }; u: string }) => {
    if (m.meta.channel !== channel && m.meta.channel !== `realtime:${channel}`) return
    Y.applyUpdate(doc, unb64(m.u), 'remote')
    console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] received -> ${plain(doc.getXmlFragment('content'))}`)
  })

  const snap = await c.database.from('doc_snapshots').select('data').eq('page_id', pageId).maybeSingle()
  if (snap.data) Y.applyUpdate(doc, unb64(snap.data.data), 'remote')
  const ups = await c.database.from('doc_updates').select('data').eq('page_id', pageId).order('id')
  for (const u of ups.data ?? []) Y.applyUpdate(doc, unb64(u.data), 'remote')
  console.log(`loaded title="${doc.getText('title').toString()}" content: ${plain(doc.getXmlFragment('content'))}`)

  const sv = Y.encodeStateVector(doc)
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(process.env.MSG ?? 'Hello from another device.')])
  doc.getXmlFragment('content').push([p])
  const ins = await c.database.from('doc_updates').insert([{ page_id: pageId, data: b64(Y.encodeStateAsUpdate(doc, sv)) }])
  console.log(ins.error ? `write failed: ${ins.error.message}` : 'wrote a paragraph')

  await new Promise((r) => setTimeout(r, Number(listen) * 1000))
  console.log(`final content: ${plain(doc.getXmlFragment('content'))}`)
  c.realtime.disconnect()
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
