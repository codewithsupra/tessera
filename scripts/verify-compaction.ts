/**
 * Live check of the compact-doc edge function.
 * Run: npx tsx --env-file=.env.local --env-file=.env.e2e.local scripts/verify-compaction.ts
 */
import { createClient } from '@insforge/sdk'
import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'

const baseUrl = process.env.VITE_INSFORGE_URL!
const anonKey = process.env.VITE_INSFORGE_ANON_KEY!
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))
let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function signIn(email: string, password: string) {
  const c = createClient({ baseUrl, anonKey })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return c
}

async function loadText(c: ReturnType<typeof createClient>, pageId: string) {
  const doc = new Y.Doc()
  const snap = await c.database.from('doc_snapshots').select('data').eq('page_id', pageId).maybeSingle()
  if (snap.data) Y.applyUpdate(doc, unb64(snap.data.data))
  const ups = await c.database.from('doc_updates').select('data').eq('page_id', pageId).order('id')
  for (const u of ups.data ?? []) Y.applyUpdate(doc, unb64(u.data))
  return { text: doc.getText('content').toString(), updates: ups.data?.length ?? 0, snapshot: !!snap.data }
}

async function main() {
  const owner = await signIn(process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!)
  const stranger = await signIn(process.env.E2E_STRANGER_EMAIL!, process.env.E2E_STRANGER_PASSWORD!)
  const ws = (await owner.database.rpc('ensure_personal_workspace')).data as unknown as string
  const pageId = randomUUID()
  await owner.database.from('pages').insert([{ id: pageId, workspace_id: ws, title: 'Compaction test' }])

  // 30 real edits, each stored as its own update
  const doc = new Y.Doc()
  const text = doc.getText('content')
  for (let i = 0; i < 30; i++) {
    const sv = Y.encodeStateVector(doc)
    text.insert(text.length, `line ${i}. `)
    if (i % 7 === 0 && text.length > 5) text.delete(0, 2)
    await owner.database.from('doc_updates').insert([{ page_id: pageId, data: b64(Y.encodeStateAsUpdate(doc, sv)) }])
  }
  const expected = text.toString()
  const before = await loadText(owner, pageId)
  check('30 updates stored before compaction', before.updates === 30 && before.text === expected)

  const denied = await stranger.functions.invoke('compact-doc', { body: { pageId } })
  check('stranger cannot compact', !!denied.error || (denied.data as { compacted?: boolean })?.compacted !== true, JSON.stringify(denied.data ?? denied.error))

  const bad = await owner.functions.invoke('compact-doc', { body: { pageId: 'nope' } })
  check('rejects a malformed page id', !!bad.error)

  const res = await owner.functions.invoke('compact-doc', { body: { pageId } })
  check('owner compaction succeeds', (res.data as { compacted?: boolean })?.compacted === true, JSON.stringify(res.data ?? res.error))

  const after = await loadText(owner, pageId)
  check('content is identical after compaction', after.text === expected, `${after.text.length} vs ${expected.length} chars`)
  check('update log was folded into the snapshot', after.updates === 0 && after.snapshot)

  // A second round on top of an existing snapshot
  const sv = Y.encodeStateVector(doc)
  text.insert(text.length, 'after snapshot.')
  await owner.database.from('doc_updates').insert([{ page_id: pageId, data: b64(Y.encodeStateAsUpdate(doc, sv)) }])
  const sv2 = Y.encodeStateVector(doc)
  text.insert(0, 'Top. ')
  await owner.database.from('doc_updates').insert([{ page_id: pageId, data: b64(Y.encodeStateAsUpdate(doc, sv2)) }])
  const res2 = await owner.functions.invoke('compact-doc', { body: { pageId } })
  const after2 = await loadText(owner, pageId)
  check('second compaction merges into the existing snapshot', (res2.data as { compacted?: boolean })?.compacted === true && after2.text === text.toString() && after2.updates === 0)

  await owner.database.from('pages').update({ deleted_at: new Date().toISOString(), updated_at: new Date(Date.now() + 1000).toISOString() }).eq('id', pageId)
  console.log(failures ? `\n${failures} failed` : '\nall passed')
  process.exit(failures ? 1 : 0)
}
main().catch((e) => {
  console.error(e)
  process.exit(2)
})
