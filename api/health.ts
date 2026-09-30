import type { VercelRequest, VercelResponse } from '@vercel/node'

// Daily Vercel cron hits this so the free-tier InsForge project never pauses.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const url = process.env.VITE_INSFORGE_URL
  const key = process.env.VITE_INSFORGE_ANON_KEY
  if (!url || !key) return res.status(500).json({ ok: false, error: 'missing InsForge env' })

  const t0 = Date.now()
  try {
    const r = await fetch(`${url}/api/database/records/app_meta?select=value&key=eq.schema_version`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const rows = (await r.json()) as { value: string }[]
    if (!r.ok || !rows[0]) throw new Error(`db ${r.status}`)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, schema: rows[0].value, dbMs: Date.now() - t0 })
  } catch (e) {
    return res.status(503).json({ ok: false, error: (e as Error).message })
  }
}
