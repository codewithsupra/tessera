/**
 * Admin access for the live verification scripts: the project API key (full access — keep it
 * server-side) from INSFORGE_API_KEY in CI, or from the linked project locally.
 */
import { existsSync, readFileSync } from 'node:fs'

export function adminKey(): string {
  if (process.env.INSFORGE_API_KEY) return process.env.INSFORGE_API_KEY
  if (existsSync('.insforge/project.json')) return JSON.parse(readFileSync('.insforge/project.json', 'utf8')).api_key as string
  throw new Error('Missing INSFORGE_API_KEY (or a linked .insforge/project.json)')
}

/** Runs one SQL statement as the project admin — test setup only (backdating rows, admin grants). */
export async function sql(query: string): Promise<unknown[]> {
  const res = await fetch(`${process.env.VITE_INSFORGE_URL}/api/database/advance/rawsql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = (await res.json()) as { rows?: unknown[]; error?: string; message?: string }
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${body.message ?? body.error}`)
  return body.rows ?? []
}
