// Owner dashboard data. Only allow-listed admins (public.app_admins) get anything; everyone
// else gets 404 so the endpoint doesn't advertise itself. Aggregates only.
import { createAdminClient, createClient } from 'npm:@insforge/sdk'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404)

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Not found' }, 404)
  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!

  // Ask as the caller: is_app_admin() reads only their own allow-list row.
  const asCaller = createClient({ baseUrl, accessToken: token })
  const check = await asCaller.database.rpc('is_app_admin')
  if (check.error || check.data !== true) return json({ error: 'Not found' }, 404)

  let days = 30
  try {
    const body = await req.json()
    if (Number.isInteger(body?.days)) days = body.days
  } catch {
    // default window
  }

  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get('API_KEY')! })
  const res = await admin.database.rpc('admin_metrics', { p_days: days })
  if (res.error) return json({ error: 'Metrics are unavailable right now' }, 500)
  return json(res.data)
}
