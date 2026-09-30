import { expect, test } from '@playwright/test'
import { api, deleteUsers, editor, expectAccessible } from './helpers'

test('a guest explores the sample workspace, then saves it into a real account', async ({ page }) => {
  const email = `e2e-pw-saved-${Date.now()}@tessera.test`
  const password = `Pw-${Date.now()}-ok`
  let savedId: string | null = null

  try {
    await page.goto('/')
    await page.getByRole('button', { name: 'Try it now — no sign-up' }).click()
    await page.waitForURL('**/app')
    await expect(page.getByText('You’re exploring as a guest.')).toBeVisible()

    // First-run sample pages appear, and are real editable pages.
    const tree = page.getByRole('tree', { name: 'Page tree' })
    await expect(tree.getByText('Welcome to Tessera')).toBeVisible()
    await expect(tree.getByText('Try multiplayer')).toBeVisible()
    await expectAccessible(page, 'guest app home')

    await tree.getByText('Welcome to Tessera').click()
    await expect(editor(page)).toContainText('Try these')
    await editor(page).locator('p').last().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Written by a Playwright guest.')
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()

    // Save the workspace into a new account.
    await page.getByRole('link', { name: 'Save my workspace' }).click()
    await page.getByLabel('Name').fill('Playwright Saver')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Save my workspace' }).click()
    await page.waitForURL('**/app', { timeout: 60_000 })

    await expect(page.getByText('You’re exploring as a guest.')).toHaveCount(0)
    await page.getByRole('tree', { name: 'Page tree' }).getByText('Welcome to Tessera').click()
    await expect(editor(page)).toContainText('Written by a Playwright guest.')
  } finally {
    const c = await api({ email, password }).catch(() => null)
    savedId = (await c?.auth.getCurrentUser())?.data.user?.id ?? null
    if (savedId) await deleteUsers([savedId])
  }
})
