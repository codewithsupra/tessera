import type { VercelRequest, VercelResponse } from '@vercel/node'

// Daily Vercel cron hits this so the free-tier InsForge project never pauses.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const url = process.env.VITE_INSFORGE_URL
  const key = process.env.VITE_INSFORGE_ANON_KEY
  if (!url || !key) return res.status(500).json({ ok: false, error: 'missing InsForge env' })

  const t0 = Date.now()
  try {
    const r = await fetch(`${url}/api/database/rpc/ping`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    const body = (await r.json()) as unknown
    if (!r.ok || body !== 'ok') throw new Error(`db ${r.status}`)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, dbMs: Date.now() - t0 })
  } catch (e) {
    return res.status(503).json({ ok: false, error: (e as Error).message })
  }
}
