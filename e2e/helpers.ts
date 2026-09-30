import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@insforge/sdk'
import { expect, type Page } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'

export function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name} (set it in .env.e2e.local or CI secrets)`)
  return v
}

export const owner = () => ({ email: env('E2E_EMAIL'), password: env('E2E_PASSWORD') })
export const stranger = () => ({ email: env('E2E_STRANGER_EMAIL'), password: env('E2E_STRANGER_PASSWORD') })

/** An API client signed in as a test account (for setup/teardown, not for assertions about UI). */
export async function api(who: { email: string; password: string }) {
  const c = createClient({ baseUrl: env('VITE_INSFORGE_URL'), anonKey: env('VITE_INSFORGE_ANON_KEY') })
  const { error } = await c.auth.signInWithPassword(who)
  if (error) throw new Error(`sign in ${who.email}: ${error.message}`)
  return c
}

function adminKey(): string {
  if (process.env.INSFORGE_API_KEY) return process.env.INSFORGE_API_KEY
  if (existsSync('.insforge/project.json')) return JSON.parse(readFileSync('.insforge/project.json', 'utf8')).api_key
  throw new Error('Missing INSFORGE_API_KEY')
}

/** Deletes accounts created by a test (cascades their workspaces). */
export async function deleteUsers(ids: string[]) {
  if (!ids.length) return
  await fetch(`${env('VITE_INSFORGE_URL')}/api/auth/users`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: ids }),
  })
}

export async function signIn(page: Page, who: { email: string; password: string }, next = '/app') {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(who.email)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((u) => u.pathname.startsWith(next.split('?')[0]))
  // The signed-in app loads lazily; wait until it is interactive (its sidebar is rendered).
  if (next.startsWith('/app')) await expect(page.getByRole('navigation', { name: 'Pages' }).first()).toBeVisible()
}

/** Fails on serious or critical accessibility violations. */
export async function expectAccessible(page: Page, context: string) {
  // Scan what people actually read: let entrance animations (finite ones) settle first.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${context}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([])
}

export const editor = (page: Page) => page.locator('.ProseMirror').first()
