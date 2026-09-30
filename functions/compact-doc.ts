// Folds a page's update log into its snapshot so documents stay fast to load.
// Reads with the caller's token (RLS applies), merges with Yjs, and commits through
// apply_compaction(), which checks edit rights and guards against concurrent compactions.
import { createClient } from 'npm:@insforge/sdk'
import * as Y from 'npm:yjs@13'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_UPDATES = 5000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function toB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sign in required' }, 401)

  let pageId: unknown
  try {
    pageId = (await req.json())?.pageId
  } catch {
    return json({ error: 'Body must be JSON: { "pageId": "<uuid>" }' }, 400)
  }
  if (typeof pageId !== 'string' || !UUID.test(pageId)) return json({ error: 'pageId must be a uuid' }, 400)

  const client = createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL')!, accessToken: token })

  const snap = await client.database.from('doc_snapshots').select('data, version').eq('page_id', pageId).maybeSingle()
  if (snap.error) return json({ error: snap.error.message }, 500)
  const ups = await client.database
    .from('doc_updates')
    .select('id, data')
    .eq('page_id', pageId)
    .order('id', { ascending: true })
    .limit(MAX_UPDATES)
  if (ups.error) return json({ error: ups.error.message }, 500)

  const updates = ups.data as { id: number; data: string }[]
  if (updates.length < 2 && snap.data) return json({ compacted: false, reason: 'nothing to do' })
  if (updates.length === 0) return json({ compacted: false, reason: 'no updates' })

  const parts = [...(snap.data ? [fromB64(snap.data.data)] : []), ...updates.map((u) => fromB64(u.data))]
  const merged = toB64(Y.mergeUpdates(parts))

  const res = await client.database.rpc('apply_compaction', {
    p_page: pageId,
    p_data: merged,
    p_merged_ids: updates.map((u) => u.id),
    p_expected_version: snap.data?.version ?? null,
  })
  if (res.error) return json({ error: res.error.message }, res.error.code === '42501' ? 403 : 500)
  return json({ compacted: res.data === true, merged: updates.length })
}
