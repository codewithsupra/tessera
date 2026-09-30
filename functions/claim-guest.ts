// "Save my workspace": moves a guest's workspaces to the caller's new real account, then
// deletes the guest. The caller proves ownership of the guest data with the single-use claim
// token the guest created before signing up. The move runs as one SQL transaction.
import { createAdminClient, createClient } from 'npm:@insforge/sdk'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const MESSAGES: Record<string, [number, string]> = {
  P0002: [400, 'That save link isn’t valid. Start again from your guest workspace.'],
  P0003: [409, 'This guest workspace has already been saved.'],
  P0005: [410, 'The save link expired. Start again from your guest workspace.'],
  '42501': [403, 'This account can’t receive a guest workspace.'],
  '22023': [400, 'Sign up with a new account to save your guest workspace.'],
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sign in first' }, 401)
  let claim: unknown
  try {
    claim = (await req.json())?.token
  } catch {
    return json({ error: 'Body must be JSON: { "token": "..." }' }, 400)
  }
  if (typeof claim !== 'string' || claim.length < 20 || claim.length > 200) return json({ error: 'Missing claim token' }, 400)

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!
  const apiKey = Deno.env.get('API_KEY')!
  const user = (await createClient({ baseUrl, accessToken: token }).auth.getCurrentUser()).data?.user
  if (!user?.id) return json({ error: 'Sign in first' }, 401)

  const admin = createAdminClient({ baseUrl, apiKey })
  const moved = await admin.database.rpc('transfer_guest', { p_token_hash: await sha256Hex(claim), p_new_user: user.id })
  if (moved.error) {
    const [status, message] = MESSAGES[moved.error.code ?? ''] ?? [500, 'Couldn’t move your guest workspace. Please try again.']
    return json({ error: message, code: moved.error.code }, status)
  }

  const guestId = moved.data as unknown as string
  const del = await fetch(`${baseUrl}/api/auth/users`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: [guestId] }),
  })
  // The data already belongs to the new account; a failed delete only leaves an empty guest
  // behind, which the janitor removes within a week.
  return json({ ok: true, guestDeleted: del.ok })
}
