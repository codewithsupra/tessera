// Daily: deletes guest accounts older than 7 days (their workspaces cascade away).
// Called by an InsForge schedule with the x-janitor-key header; nobody else can trigger it.
import { createAdminClient } from 'npm:@insforge/sdk'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export default async function (req: Request): Promise<Response> {
  const expected = Deno.env.get('JANITOR_SECRET') ?? ''
  const given = req.headers.get('x-janitor-key') ?? ''
  if (!expected || !safeEqual(given, expected)) return json({ error: 'Forbidden' }, 403)

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!
  const apiKey = Deno.env.get('API_KEY')!
  const admin = createAdminClient({ baseUrl, apiKey })

  let olderThan = '7 days'
  try {
    const body = req.method === 'POST' ? await req.json() : null
    // Tests may shorten the window (still admin-gated by the secret).
    if (body && typeof body.olderThan === 'string' && /^\d+ (seconds|minutes|hours|days)$/.test(body.olderThan)) olderThan = body.olderThan
  } catch {
    // no body
  }

  let deleted = 0
  for (let round = 0; round < 10; round++) {
    const { data, error } = await admin.database.rpc('stale_guest_ids', { p_older_than: olderThan, p_limit: 100 })
    if (error) return json({ error: error.message, deleted }, 500)
    const ids = (data as unknown as string[]) ?? []
    if (!ids.length) break
    const res = await fetch(`${baseUrl}/api/auth/users`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: ids }),
    })
    if (!res.ok) return json({ error: `delete failed: ${res.status}`, deleted }, 502)
    deleted += ids.length
  }
  return json({ ok: true, deleted, olderThan })
}
