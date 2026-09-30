/**
 * M0 spike: can InsForge realtime relay Yjs updates reliably?
 * Run: npx tsx --env-file=.env.local scripts/spike-sync.ts
 */
import { createClient } from '@insforge/sdk'
import * as Y from 'yjs'

const url = process.env.VITE_INSFORGE_URL!
const anonKey = process.env.VITE_INSFORGE_ANON_KEY!
const channel = `spike:${Math.random().toString(36).slice(2, 10)}`

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))
const CHUNK = 64 * 1024
async function send(client: ReturnType<typeof createClient>, from: string, u: Uint8Array) {
  const data = b64(u)
  if (data.length <= CHUNK) return client.realtime.publish(channel, 'y-update', { from, u: data })
  const id = Math.random().toString(36).slice(2)
  const n = Math.ceil(data.length / CHUNK)
  for (let i = 0; i < n; i++) {
    await client.realtime.publish(channel, 'y-chunk', { from, id, i, n, d: data.slice(i * CHUNK, (i + 1) * CHUNK) })
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Peer = {
  name: string
  doc: Y.Doc
  client: ReturnType<typeof createClient>
  received: number
  online: boolean
}

async function makePeer(name: string): Promise<Peer> {
  const client = createClient({ baseUrl: url, anonKey })
  const doc = new Y.Doc()
  const peer: Peer = { name, doc, client, received: 0, online: true }
  await client.realtime.connect()
  const res = await client.realtime.subscribe(channel)
  if (!res.ok) throw new Error(`${name} subscribe failed: ${res.error?.message}`)

  const partial = new Map<string, string[]>()
  const apply = (u: Uint8Array) => {
    Y.applyUpdate(doc, u, 'remote')
    // gap recovery: a missing earlier update leaves pending structs; ask peers for the diff
    if (doc.store.pendingStructs || doc.store.pendingDs) {
      void client.realtime.publish(channel, 'y-sv', { from: name, sv: b64(Y.encodeStateVector(doc)) })
    }
  }
  client.realtime.on('y-update', (msg: any) => {
    if (msg.from === name) return
    peer.received++
    apply(unb64(msg.u))
  })
  client.realtime.on('y-chunk', (msg: any) => {
    if (msg.from === name) return
    const parts = partial.get(msg.id) ?? new Array(msg.n)
    parts[msg.i] = msg.d
    partial.set(msg.id, parts)
    if (parts.filter(Boolean).length === msg.n) {
      partial.delete(msg.id)
      peer.received++
      apply(unb64(parts.join('')))
    }
  })
  // sync step 1: peer asks for what it is missing; others answer with a diff
  client.realtime.on('y-sv', async (msg: any) => {
    if (msg.from === name) return
    const diff = Y.encodeStateAsUpdate(doc, unb64(msg.sv))
    await send(client, name, diff)
  })
  doc.on('update', async (u: Uint8Array, origin: unknown) => {
    if (origin === 'remote' || !peer.online) return
    await send(client, name, u)
  })
  return peer
}

const text = (p: Peer) => p.doc.getText('t').toString()

async function waitFor(cond: () => boolean, ms = 8000) {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) return false
    await sleep(25)
  }
  return true
}

const results: Record<string, string> = {}
const record = (k: string, ok: boolean, extra = '') => {
  results[k] = `${ok ? 'PASS' : 'FAIL'} ${extra}`
  console.log(k.padEnd(28), results[k])
}

async function main() {
  const A = await makePeer('A')
  const B = await makePeer('B')
  await sleep(500)

  // 1. basic relay + latency
  let t0 = Date.now()
  A.doc.getText('t').insert(0, 'hello ')
  record('basic relay', await waitFor(() => text(B) === 'hello '), `${Date.now() - t0}ms`)

  // 2. concurrent edits converge
  A.doc.getText('t').insert(6, 'from A. ')
  B.doc.getText('t').insert(0, 'B says: ')
  const conv = await waitFor(() => text(A) === text(B) && text(A).includes('from A') && text(A).includes('B says'))
  record('concurrent convergence', conv, JSON.stringify(text(A)))

  // 3. payload sizes (base64 of a raw update)
  for (const kb of [1, 16, 64, 256, 1024, 4096]) {
    const before = B.received
    const big = 'x'.repeat(kb * 1024)
    t0 = Date.now()
    A.doc.getMap('blobs').set(`k${kb}`, big)
    const ok = await waitFor(() => B.doc.getMap('blobs').get(`k${kb}`) === big, 10000)
    record(`payload ${kb}KB`, ok, ok ? `${Date.now() - t0}ms` : `recv delta=${B.received - before}`)
  }

  // 4. burst: 200 keystroke-sized updates
  const burstBefore = B.received
  t0 = Date.now()
  for (let i = 0; i < 200; i++) A.doc.getText('burst').insert(i, 'a')
  const burstOk = await waitFor(() => B.doc.getText('burst').length === 200, 15000)
  record('burst 200 msgs', burstOk, `${Date.now() - t0}ms, got ${B.received - burstBefore}, len=${B.doc.getText('burst').length}`)

  // 5. offline edits then resync via state-vector exchange
  B.online = false
  B.client.realtime.unsubscribe(channel)
  await sleep(300)
  A.doc.getText('t').insert(0, '[A offline-period] ')
  B.doc.getText('t').insert(text(B).length, ' [B offline edit]')
  await sleep(500)
  const diverged = text(A) !== text(B)
  const res = await B.client.realtime.subscribe(channel)
  B.online = true
  // push B's missing-for-others state, then ask others for B's missing state
  await send(B.client, 'B', Y.encodeStateAsUpdate(B.doc))
  await B.client.realtime.publish(channel, 'y-sv', { from: 'B', sv: b64(Y.encodeStateVector(B.doc)) })
  const merged = await waitFor(() => text(A) === text(B) && text(A).includes('[B offline edit]') && text(A).includes('[A offline-period]'))
  record('offline merge', res.ok && diverged && merged, JSON.stringify(text(A)))

  // 6. presence
  const sub = await A.client.realtime.subscribe(channel)
  record('presence snapshot', !!sub.ok, `members=${sub.presence?.members?.length ?? 'n/a'}`)

  A.client.realtime.disconnect()
  B.client.realtime.disconnect()
  console.log('\nSUMMARY', JSON.stringify(results, null, 2))
  process.exit(Object.values(results).some((r) => r.startsWith('FAIL')) ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
